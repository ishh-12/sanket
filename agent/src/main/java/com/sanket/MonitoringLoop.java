package com.sanket;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class MonitoringLoop {
    private static final String AGENT_VERSION = "0.1.0";
    private static final long HEARTBEAT_INTERVAL_SECONDS = 30;
    private static final long REGISTRATION_RETRY_SECONDS = 15;

    private final SystemInfoCollector sysInfo;
    private final BackendClient backendClient;
    private final DeviceStateManager stateManager;
    private final RepairExecutor repairExecutor = new RepairExecutor();
    private final StorageScanner storageScanner = new StorageScanner();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final java.util.concurrent.ExecutorService commandExecutor =
            Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "sanket-commands");
                thread.setDaemon(true);
                return thread;
            });

    private volatile String deviceId;
    private volatile boolean heartbeatStarted = false;

    public MonitoringLoop(String backendUrl, String agentToken) {
        this.sysInfo = new SystemInfoCollector();
        this.backendClient = new BackendClient(backendUrl, agentToken);
        this.stateManager = new DeviceStateManager();
    }

    public void start() {
        System.out.println("Starting SANKET Agent monitoring loop...");

        deviceId = stateManager.getDeviceId();
        if (deviceId != null) {
            System.out.println("Found saved device ID: " + deviceId);
            if (verifySavedDevice()) {
                beginCommunication();
                return;
            }
        }

        scheduleRegistrationWithRetry();
    }

    private boolean verifySavedDevice() {
        BackendClient.HeartbeatResponse response =
                backendClient.exchangeHeartbeat(deviceId, AGENT_VERSION);

        if (response.success) {
            handleHeartbeatSuccess(response);
            return true;
        }

        int status = response.httpStatus;
        if (status == 404 || status == 400 || status == 409) {
            System.err.println("Backend no longer knows device " + deviceId
                    + " (HTTP " + status + "). Re-registering...");
            stateManager.clear();
            deviceId = null;
            return false;
        }

        // Network/server problem: keep the saved identity and let the retry loop reconnect.
        System.err.println("Could not reach backend to verify device (HTTP " + status
                + "). Will retry with saved identity.");
        scheduler.schedule(this::retryConnection, 10, TimeUnit.SECONDS);
        return true;
    }

    private void retryConnection() {
        String currentId = deviceId;
        if (currentId != null) {
            BackendClient.HeartbeatResponse response =
                    backendClient.exchangeHeartbeat(currentId, AGENT_VERSION);
            if (response.success) {
                System.out.println("Reconnected using saved device ID.");
                handleHeartbeatSuccess(response);
                beginCommunication();
                return;
            }
            if (response.httpStatus == 404 || response.httpStatus == 400 || response.httpStatus == 409) {
                stateManager.clear();
                deviceId = null;
                scheduleRegistrationWithRetry();
                return;
            }
        }
        scheduleRegistrationWithRetry();
    }

    private void scheduleRegistrationWithRetry() {
        registerDevice();
        if (deviceId == null) {
            System.err.println("Registration pending - retrying in " + REGISTRATION_RETRY_SECONDS + "s...");
            scheduler.schedule(this::scheduleRegistrationWithRetry, REGISTRATION_RETRY_SECONDS, TimeUnit.SECONDS);
            return;
        }
        beginCommunication();
    }

    private void beginCommunication() {
        sendHeartbeatNow();

        if (!heartbeatStarted) {
            heartbeatStarted = true;
            scheduler.scheduleAtFixedRate(
                    this::heartbeatTask, HEARTBEAT_INTERVAL_SECONDS,
                    HEARTBEAT_INTERVAL_SECONDS, TimeUnit.SECONDS);
            long metricsInterval = metricsIntervalSeconds();
            scheduler.scheduleAtFixedRate(
                    this::metricsTask, 5, metricsInterval, TimeUnit.SECONDS);
            System.out.println("Heartbeat every " + HEARTBEAT_INTERVAL_SECONDS
                    + "s, metrics every " + metricsInterval + "s.");
        }

        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown));
    }

    private long metricsIntervalSeconds() {
        try {
            String configured = new EnvLoader().get("METRICS_INTERVAL_SECONDS", "60");
            long value = Long.parseLong(configured.trim());
            return Math.max(15, value);
        } catch (NumberFormatException e) {
            return 60;
        }
    }

    private void heartbeatTask() {
        try {
            sendHeartbeatNow();
        } catch (Exception e) {
            System.err.println("Heartbeat task error: " + e.getMessage());
        }
    }

    private void sendHeartbeatNow() {
        if (deviceId == null) {
            return;
        }

        BackendClient.HeartbeatResponse response =
                backendClient.exchangeHeartbeat(deviceId, AGENT_VERSION);

        if (response.success) {
            handleHeartbeatSuccess(response);
        } else if (response.httpStatus == 404 || response.httpStatus == 400 || response.httpStatus == 409) {
            System.err.println("Backend rejected our deviceId (HTTP " + response.httpStatus
                    + "). Clearing state and re-registering...");
            stateManager.clear();
            deviceId = null;
            scheduleRegistrationWithRetry();
        } else {
            System.err.println("[" + new java.util.Date() + "] Heartbeat failed"
                    + (response.message != null ? ": " + response.message : ""));
        }
    }

    private void handleHeartbeatSuccess(BackendClient.HeartbeatResponse response) {
        System.out.println("[" + new java.util.Date() + "] Heartbeat OK");
        dispatchCommands(response.pendingRepairs, response.requestedScan);
    }

    private void dispatchCommands(List<BackendClient.HeartbeatResponse.PendingRepair> repairs,
                                  boolean requestedScan) {
        if (repairs != null && !repairs.isEmpty()) {
            for (BackendClient.HeartbeatResponse.PendingRepair repair : repairs) {
                commandExecutor.submit(() -> executeRepair(repair));
            }
        }
        if (requestedScan) {
            commandExecutor.submit(this::executeStorageScan);
        }
    }

    private void executeRepair(BackendClient.HeartbeatResponse.PendingRepair repair) {
        try {
            System.out.println("[Command] Executing approved repair: " + repair.repairId
                    + (repair.name != null ? " (" + repair.name + ")" : ""));
            RepairExecutor.Result result = repairExecutor.execute(repair.repairId);
            boolean stored = backendClient.postRepairResult(deviceId, repair.repairId, result);
            System.out.println("[Command] Repair " + repair.repairId + " "
                    + (result.success ? "completed" : "failed")
                    + (stored ? "; result reported" : "; result reporting FAILED"));
        } catch (Exception e) {
            System.err.println("[Command] Repair execution error: " + e.getMessage());
            RepairExecutor.Result failure =
                    new RepairExecutor.Result(false, null, e.getMessage(), 0);
            backendClient.postRepairResult(deviceId, repair.repairId, failure);
        }
    }

    private void executeStorageScan() {
        try {
            System.out.println("[Command] Running deep storage scan...");
            Map<String, Object> scan = storageScanner.scan();
            boolean stored = backendClient.postScanResult(deviceId, scan);
            System.out.println(stored ? "[Command] Storage scan reported."
                    : "[Command] Storage scan reporting FAILED.");
        } catch (Exception e) {
            System.err.println("[Command] Storage scan error: " + e.getMessage());
        }
    }

    private void metricsTask() {
        try {
            if (deviceId == null) {
                return;
            }
            Map<String, Object> metrics = sysInfo.collectMetrics();
            if (backendClient.sendMetrics(deviceId, metrics)) {
                System.out.println("[" + new java.util.Date() + "] Metrics sent successfully");
            }
        } catch (Exception e) {
            System.err.println("Metrics task error: " + e.getMessage());
        }
    }

    private void registerDevice() {
        try {
            String hostname = sysInfo.getDeviceHostname();
            Map<String, Object> profile = sysInfo.collectSystemProfile();
            String serial = stateManager.getOrCreateSerial();

            System.out.println("Registering device: " + hostname);
            BackendClient.RegistrationResponse response =
                    backendClient.register(profile, hostname, serial);

            if (response.success && response.deviceId != null) {
                deviceId = response.deviceId;
                stateManager.setDeviceId(deviceId);
                System.out.println("Device registered successfully! Device ID: " + deviceId);
            } else {
                System.err.println("Registration failed: "
                        + (response.message != null ? response.message : "unknown error"));
            }
        } catch (java.net.ConnectException e) {
            System.err.println("Cannot reach backend: is it running on the configured URL?");
        } catch (Exception e) {
            System.err.println("Registration error: " + e.getMessage());
        }
    }

    private void shutdown() {
        System.out.println("Shutting down SANKET Agent...");
        scheduler.shutdown();
        commandExecutor.shutdown();
        try {
            if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
            if (!commandExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                commandExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            commandExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
