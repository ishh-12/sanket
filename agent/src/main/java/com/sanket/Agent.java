package com.sanket;

public class Agent {
    public static void main(String[] args) {
        System.setProperty("org.slf4j.simpleLogger.defaultLogLevel", "warn");

        EnvLoader env = new EnvLoader();

        String backendUrl = env.get("BACKEND_URL", "http://localhost:5000");
        String agentToken = env.get("AGENT_API_TOKEN", "");

        if (agentToken.isBlank()) {
            System.err.println("--------------------------------------------------");
            System.err.println("AGENT_API_TOKEN is not configured.");
            System.err.println("Set it in backend/.env (shared with the backend) or as an environment variable.");
            System.err.println("The backend rejects agents with missing or wrong tokens.");
            System.err.println("--------------------------------------------------");
            System.exit(1);
        }

        System.out.println("========================================");
        System.out.println("SANKET Agent v0.1.0");
        System.out.println("========================================");
        System.out.println("Backend URL: " + backendUrl);
        System.out.println("========================================");

        MonitoringLoop loop = new MonitoringLoop(backendUrl, agentToken);
        loop.start();
    }
}
