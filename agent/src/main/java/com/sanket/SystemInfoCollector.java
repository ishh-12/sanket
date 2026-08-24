package com.sanket;

import oshi.SystemInfo;
import oshi.hardware.CentralProcessor;
import oshi.hardware.GlobalMemory;
import oshi.hardware.HardwareAbstractionLayer;
import oshi.software.os.OSFileStore;
import oshi.software.os.OperatingSystem;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class SystemInfoCollector {
    private final SystemInfo systemInfo;
    private final HardwareAbstractionLayer hardware;
    private final OperatingSystem os;
    private long[] prevTicks;
    private final Map<String, long[]> prevNetworkCounters = new HashMap<>();

    public SystemInfoCollector() {
        this.systemInfo = new SystemInfo();
        this.hardware = systemInfo.getHardware();
        this.os = systemInfo.getOperatingSystem();
        CentralProcessor cpu = hardware.getProcessor();
        this.prevTicks = cpu.getSystemCpuLoadTicks();
        snapshotNetworkCounters();
    }

    public Map<String, Object> collectSystemProfile() {
        Map<String, Object> profile = new HashMap<>();

        profile.put("operatingSystem", os.toString());
        profile.put("architecture", System.getProperty("os.arch"));
        profile.put("cpu", collectCpuInfo());
        profile.put("memory", collectMemoryInfo());
        profile.put("storage", collectVolumeProfile());
        profile.put("network", collectNetworkProfile());

        return profile;
    }

    private Map<String, Object> collectCpuInfo() {
        Map<String, Object> cpuInfo = new HashMap<>();
        CentralProcessor cpu = hardware.getProcessor();

        cpuInfo.put("cores", cpu.getPhysicalProcessorCount());
        cpuInfo.put("threads", cpu.getLogicalProcessorCount());
        String model = cpu.getProcessorIdentifier().getName();
        if (model != null) {
            model = model.replaceAll("\\s+", " ").trim();
        }
        cpuInfo.put("model", model);
        long vendorFreq = cpu.getProcessorIdentifier().getVendorFreq();
        cpuInfo.put("speed", vendorFreq > 0 ? Math.round(vendorFreq / 1_000_000.0) : null);

        return cpuInfo;
    }

    private Map<String, Object> collectMemoryInfo() {
        Map<String, Object> memInfo = new HashMap<>();
        GlobalMemory memory = hardware.getMemory();

        memInfo.put("total", memory.getTotal() / (1024L * 1024L * 1024L));
        String memoryType = "Unknown";
        try {
            var modules = memory.getPhysicalMemory();
            if (!modules.isEmpty()) {
                String detected = modules.get(0).getMemoryType();
                if (detected != null && !detected.isBlank()) {
                    memoryType = detected.trim();
                }
            }
        } catch (Exception ignored) {
        }
        memInfo.put("type", memoryType);

        return memInfo;
    }

    private List<Map<String, Object>> collectVolumeProfile() {
        List<Map<String, Object>> volumes = new ArrayList<>();
        for (OSFileStore store : os.getFileSystem().getFileStores()) {
            long total = store.getTotalSpace();
            if (total < 1024L * 1024L * 1024L) {
                continue;
            }
            Map<String, Object> volume = new HashMap<>();
            volume.put("device", store.getMount());
            volume.put("capacity", total / (1024L * 1024L * 1024L));
            String type = store.getType();
            volume.put("type", type != null && !type.isBlank() ? type : "local disk");
            volumes.add(volume);
        }
        return dedupeVolumes(volumes);
    }

    private List<Map<String, Object>> dedupeVolumes(List<Map<String, Object>> volumes) {
        List<Map<String, Object>> unique = new ArrayList<>();
        for (Map<String, Object> volume : volumes) {
            boolean exists = unique.stream()
                    .anyMatch(v -> String.valueOf(v.get("device")).equals(String.valueOf(volume.get("device"))));
            if (!exists) {
                unique.add(volume);
            }
        }
        return unique;
    }

    private Map<String, Object> collectNetworkProfile() {
        Map<String, Object> netInfo = new HashMap<>();
        var networkIfs = hardware.getNetworkIFs(true);

        netInfo.put("interfaces", networkIfs.size());

        String primary = networkIfs.stream()
                .filter(nif -> nif.getIfOperStatus() == oshi.hardware.NetworkIF.IfOperStatus.UP)
                .filter(nif -> nif.getIPv4addr().length > 0)
                .findFirst()
                .map(nif -> nif.getDisplayName() != null ? nif.getDisplayName() : nif.getName())
                .orElse(null);
        netInfo.put("primaryInterface", primary);

        return netInfo;
    }

    private void snapshotNetworkCounters() {
        try {
            for (oshi.hardware.NetworkIF nif : hardware.getNetworkIFs(true)) {
                nif.updateAttributes();
                prevNetworkCounters.put(nif.getName(),
                        new long[]{nif.getBytesRecv(), nif.getBytesSent(), nif.getPacketsRecv(), nif.getPacketsSent()});
            }
        } catch (Exception ignored) {
        }
    }

    public double getCpuLoad() {
        CentralProcessor cpu = hardware.getProcessor();
        long[] currentTicks = cpu.getSystemCpuLoadTicks();
        double load = cpu.getSystemCpuLoadBetweenTicks(prevTicks) * 100;
        prevTicks = currentTicks;

        if (load < 0) load = 0;
        if (load > 100) load = 100;
        return Math.round(load * 10) / 10.0;
    }

    public Double getCpuTemperature() {
        try {
            double temp = hardware.getSensors().getCpuTemperature();
            return temp > 0 ? temp : null;
        } catch (Exception e) {
            return null;
        }
    }

    public Map<String, Object> collectMetrics() {
        Map<String, Object> metrics = new HashMap<>();

        double cpuUsage = getCpuLoad();
        Map<String, Object> cpu = new HashMap<>();
        cpu.put("usage", (int) cpuUsage);
        Double temperature = getCpuTemperature();
        if (temperature != null) {
            cpu.put("temperature", Math.round(temperature * 10) / 10.0);
        }
        metrics.put("cpu", cpu);

        GlobalMemory memory = hardware.getMemory();
        long memTotal = memory.getTotal();
        long memUsed = memTotal - memory.getAvailable();
        Map<String, Object> memMetrics = new HashMap<>();
        memMetrics.put("used", memUsed / (1024L * 1024L * 1024L));
        memMetrics.put("total", memTotal / (1024L * 1024L * 1024L));
        memMetrics.put("usage", (int) ((memUsed * 100) / memTotal));
        metrics.put("memory", memMetrics);

        List<Map<String, Object>> storageMetrics = new ArrayList<>();
        var mounts = os.getFileSystem().getFileStores();
        List<String> seenMounts = new ArrayList<>();
        for (OSFileStore store : mounts) {
            long total = store.getTotalSpace();
            if (total < 1024L * 1024L * 1024L) {
                continue;
            }
            String mount = store.getMount();
            if (seenMounts.contains(mount)) {
                continue;
            }
            seenMounts.add(mount);
            long usable = store.getUsableSpace();
            long used = total - usable;
            Map<String, Object> driveMetric = new HashMap<>();
            driveMetric.put("device", mount);
            driveMetric.put("total", total / (1024L * 1024L * 1024L));
            driveMetric.put("used", used / (1024L * 1024L * 1024L));
            driveMetric.put("usage", (int) ((used * 100) / total));
            storageMetrics.add(driveMetric);
        }
        metrics.put("storage", storageMetrics);

        Map<String, Object> netMetrics = new HashMap<>();
        long bytesIn = 0;
        long bytesOut = 0;
        long packetsIn = 0;
        long packetsOut = 0;
        try {
            for (oshi.hardware.NetworkIF nif : hardware.getNetworkIFs(true)) {
                nif.updateAttributes();
                long[] prev = prevNetworkCounters.get(nif.getName());
                long curRecv = nif.getBytesRecv();
                long curSent = nif.getBytesSent();
                long curInPackets = nif.getPacketsRecv();
                long curOutPackets = nif.getPacketsSent();

                if (prev != null) {
                    long dRecv = curRecv - prev[0];
                    long dSent = curSent - prev[1];
                    long dInPackets = curInPackets - prev[2];
                    long dOutPackets = curOutPackets - prev[3];
                    if (dRecv > 0) bytesIn += dRecv;
                    if (dSent > 0) bytesOut += dSent;
                    if (dInPackets > 0) packetsIn += dInPackets;
                    if (dOutPackets > 0) packetsOut += dOutPackets;
                }

                prevNetworkCounters.put(nif.getName(),
                        new long[]{curRecv, curSent, curInPackets, curOutPackets});
            }
        } catch (Exception ignored) {
        }
        netMetrics.put("bytesIn", bytesIn);
        netMetrics.put("bytesOut", bytesOut);
        netMetrics.put("packetsIn", packetsIn);
        netMetrics.put("packetsOut", packetsOut);
        metrics.put("network", netMetrics);

        return metrics;
    }

    public String getDeviceHostname() {
        try {
            String host = os.getNetworkParams().getHostName();
            if (host != null && !host.isBlank()) {
                return host;
            }
        } catch (Exception ignored) {
        }
        return System.getenv("COMPUTERNAME") != null
                ? System.getenv("COMPUTERNAME")
                : "windows-device";
    }
}
