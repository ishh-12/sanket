package com.sanket;

import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class BackendClient {
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final OkHttpClient HTTP_CLIENT = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build();

    private final String backendUrl;
    private final String agentToken;

    public BackendClient(String backendUrl, String agentToken) {
        this.backendUrl = backendUrl != null ? backendUrl.replaceAll("/+$", "") : "http://localhost:5000";
        this.agentToken = agentToken;
    }

    public RegistrationResponse register(Map<String, Object> profileData, String deviceName, String serial) throws IOException {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", deviceName);
        payload.put("serial", serial);
        payload.put("stableProfile", profileData);

        Request request = buildRequest("/api/device/register", "POST", toJson(payload));
        try (Response response = HTTP_CLIENT.newCall(request).execute()) {
            String body = readBody(response);
            if (response.code() == 401) {
                throw new IOException("Authentication failed: backend rejected the AGENT_API_TOKEN (HTTP 401)");
            }
            if (!response.isSuccessful()) {
                throw new IOException("Registration failed: HTTP " + response.code() + " " + snippet(body));
            }
            return MAPPER.readValue(body, RegistrationResponse.class);
        }
    }

    public HeartbeatResponse exchangeHeartbeat(String deviceId, String agentVersion) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("deviceId", deviceId);
            payload.put("agentVersion", agentVersion);

            Request request = buildRequest("/api/device/heartbeat", "POST", toJson(payload));
            try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                String body = readBody(response);
                if (response.code() == 200) {
                    return MAPPER.readValue(body, HeartbeatResponse.class);
                }
                HeartbeatResponse error = new HeartbeatResponse();
                error.success = false;
                error.httpStatus = response.code();
                error.message = snippet(body);
                return error;
            }
        } catch (IOException e) {
            System.err.println("Heartbeat failed: " + e.getMessage());
            HeartbeatResponse error = new HeartbeatResponse();
            error.success = false;
            error.httpStatus = -1;
            error.message = e.getMessage();
            return error;
        }
    }

    public boolean sendMetrics(String deviceId, Map<String, Object> metrics) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>(metrics);
            payload.put("deviceId", deviceId);

            Request request = buildRequest("/api/device/metrics", "POST", toJson(payload));
            try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    System.err.println("Metrics rejected: HTTP " + response.code() + " " + snippet(readBody(response)));
                    return false;
                }
                return true;
            }
        } catch (IOException e) {
            System.err.println("Metrics submission failed: " + e.getMessage());
            return false;
        }
    }

    public boolean postRepairResult(String deviceId, String repairId, RepairExecutor.Result result) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("deviceId", deviceId);
            payload.put("repairId", repairId);
            payload.put("success", result.success);
            payload.put("output", result.output);
            payload.put("error", result.error);
            payload.put("durationMs", result.durationMs);

            Request request = buildRequest("/api/healing/result", "POST", toJson(payload));
            try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    System.err.println("Repair result rejected: HTTP " + response.code());
                    return false;
                }
                return true;
            }
        } catch (IOException e) {
            System.err.println("Failed to submit repair result: " + e.getMessage());
            return false;
        }
    }

    public boolean postScanResult(String deviceId, Map<String, Object> scan) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("deviceId", deviceId);
            payload.put("scan", scan);

            Request request = buildRequest("/api/storage/scan-result", "POST", toJson(payload));
            try (Response response = HTTP_CLIENT.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    System.err.println("Scan result rejected: HTTP " + response.code());
                    return false;
                }
                return true;
            }
        } catch (IOException e) {
            System.err.println("Failed to submit scan result: " + e.getMessage());
            return false;
        }
    }

    private Request buildRequest(String path, String method, String json) {
        RequestBody body = RequestBody.create(json, JSON);
        return new Request.Builder()
                .url(backendUrl + path)
                .addHeader("X-Agent-Token", agentToken == null ? "" : agentToken)
                .post(body)
                .build();
    }

    private String toJson(Object value) throws IOException {
        return MAPPER.writeValueAsString(value);
    }

    private String readBody(Response response) throws IOException {
        return response.body() != null ? response.body().string() : "";
    }

    private String snippet(String body) {
        if (body == null) return "";
        String compact = body.replace('\n', ' ').trim();
        return compact.length() > 200 ? compact.substring(0, 200) + "..." : compact;
    }

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class RegistrationResponse {
        public boolean success;
        public String deviceId;
        public String message;

        public RegistrationResponse() {
        }
    }

    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class HeartbeatResponse {
        public boolean success;
        public String message;
        public List<PendingRepair> pendingRepairs;
        public boolean requestedScan;
        public int httpStatus = 200;

        // Accept extra fields (e.g. timestamp, serverTime) without failing.
        @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
        public static class PendingRepair {
            public String requestId;
            public String repairId;
            public String name;
            public String description;
        }
    }
}
