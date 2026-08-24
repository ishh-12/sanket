package com.sanket;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;
import java.util.UUID;

public class DeviceStateManager {
    private static final String STATE_FILE = "sanket_device_state.properties";
    private static final String LEGACY_STATE_FILE = "sanket_device_state.txt";

    private final Path statePath;
    private final Properties state = new Properties();

    public DeviceStateManager() {
        this.statePath = Paths.get(STATE_FILE).toAbsolutePath();
        load();
    }

    private void load() {
        if (Files.isRegularFile(statePath)) {
            try (InputStream in = Files.newInputStream(statePath)) {
                state.load(in);
            } catch (IOException e) {
                System.err.println("Failed to load device state: " + e.getMessage());
            }
            return;
        }

        Path legacy = Paths.get(LEGACY_STATE_FILE).toAbsolutePath();
        if (Files.isRegularFile(legacy)) {
            try {
                String legacyId = Files.readString(legacy).trim();
                if (!legacyId.isEmpty()) {
                    state.setProperty("deviceId", legacyId);
                    save();
                    System.out.println("Migrated legacy device state file.");
                }
            } catch (IOException e) {
                System.err.println("Could not migrate legacy device state: " + e.getMessage());
            }
        }
    }

    public String getDeviceId() {
        return state.getProperty("deviceId");
    }

    public void setDeviceId(String deviceId) {
        if (deviceId == null || deviceId.isBlank()) {
            return;
        }
        state.setProperty("deviceId", deviceId);
        ensureSerial();
        save();
    }

    public void clear() {
        state.clear();
        try {
            Files.deleteIfExists(statePath);
            Files.deleteIfExists(Paths.get(LEGACY_STATE_FILE).toAbsolutePath());
            System.out.println("Saved device identity cleared. A new registration will be performed.");
        } catch (IOException e) {
            System.err.println("Failed to clear device state: " + e.getMessage());
        }
    }

    public String getOrCreateSerial() {
        String serial = state.getProperty("serial");
        if (serial == null || serial.isBlank()) {
            serial = UUID.randomUUID().toString();
            state.setProperty("serial", serial);
            save();
        }
        return serial;
    }

    private void ensureSerial() {
        getOrCreateSerial();
    }

    private void save() {
        try (OutputStream out = Files.newOutputStream(statePath)) {
            state.store(out, "SANKET agent device identity");
        } catch (IOException e) {
            System.err.println("Failed to save device state: " + e.getMessage());
        }
    }
}
