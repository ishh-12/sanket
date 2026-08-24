package com.sanket;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class StorageScanner {

    private static final long MAX_FILE_BYTES = 200L * 1024 * 1024; // large-file threshold: 200 MB
    private static final int MAX_LARGE_FILES = 15;
    private static final int MAX_DUPLICATE_GROUPS = 10;
    private static final long MIN_DUPLICATE_BYTES = 10L * 1024 * 1024;
    private static final int MAX_VISITED_FILES = 80_000;
    private static final long MAX_SCAN_MS = 60_000;

    public Map<String, Object> scan() {
        long start = System.currentTimeMillis();

        List<Map<String, Object>> drives = new ArrayList<>();
        for (java.io.File root : java.io.File.listRoots()) {
            long total = root.getTotalSpace();
            if (total < 1024L * 1024 * 1024) {
                continue;
            }
            long usable = root.getUsableSpace();
            Map<String, Object> drive = new LinkedHashMap<>();
            drive.put("device", root.getAbsolutePath());
            drive.put("totalGB", total / (1024L * 1024 * 1024));
            drive.put("usableGB", usable / (1024L * 1024 * 1024));
            drive.put("usedGB", (total - usable) / (1024L * 1024 * 1024));
            drives.add(drive);
        }

        final List<Map<String, Object>> largeFiles = new ArrayList<>();
        final Map<String, List<Path>> duplicateGroups = new HashMap<>();
        final AtomicInteger visited = new AtomicInteger();
        final AtomicLong scannedBytes = new AtomicLong();
        final boolean[] truncated = {false};
        final long deadline = start + MAX_SCAN_MS;

        Path userHome = Path.of(System.getProperty("user.home"));
        Path tempDir = Path.of(System.getProperty("java.io.tmpdir"));

        try {
            Files.walkFileTree(userHome, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (System.currentTimeMillis() > deadline || visited.get() > MAX_VISITED_FILES) {
                        truncated[0] = true;
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    String name = dir.getFileName() != null ? dir.getFileName().toString().toLowerCase() : "";
                    if (name.equals("node_modules") || name.startsWith("$recycle.bin") || name.equals("system volume information")) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (System.currentTimeMillis() > deadline || visited.incrementAndGet() > MAX_VISITED_FILES) {
                        truncated[0] = true;
                        return FileVisitResult.TERMINATE;
                    }
                    try {
                        if (!attrs.isRegularFile() || attrs.size() <= 0) {
                            return FileVisitResult.CONTINUE;
                        }
                        scannedBytes.addAndGet(attrs.size());

                        if (attrs.size() >= MAX_FILE_BYTES && largeFiles.size() < MAX_LARGE_FILES * 4) {
                            Map<String, Object> entry = new LinkedHashMap<>();
                            entry.put("path", file.toString());
                            entry.put("sizeMB", attrs.size() / (1024L * 1024));
                            entry.put("lastModified", attrs.lastModifiedTime().toInstant().toString());
                            largeFiles.add(entry);
                        }

                        if (attrs.size() >= MIN_DUPLICATE_BYTES) {
                            String key = file.getFileName() + "::" + attrs.size();
                            duplicateGroups.computeIfAbsent(key, k -> new ArrayList<>()).add(file);
                        }
                    } catch (Exception ignored) {
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            System.err.println("[StorageScanner] Walk error (results partial): " + e.getMessage());
            truncated[0] = true;
        }

        largeFiles.sort((a, b) -> Long.compare((long) b.get("sizeMB"), (long) a.get("sizeMB")));
        List<Map<String, Object>> topLarge = largeFiles.subList(0, Math.min(MAX_LARGE_FILES, largeFiles.size()));

        List<Map<String, Object>> duplicates = new ArrayList<>();
        for (Map.Entry<String, List<Path>> entry : duplicateGroups.entrySet()) {
            List<Path> paths = entry.getValue();
            if (paths.size() < 2) continue;
            try {
                long size = Files.size(paths.get(0));
                Map<String, Object> group = new LinkedHashMap<>();
                group.put("name", paths.get(0).getFileName().toString());
                group.put("sizeMB", size / (1024L * 1024));
                List<String> pathStrings = new ArrayList<>();
                for (Path p : paths) {
                    if (pathStrings.size() >= 5) break;
                    pathStrings.add(p.toString());
                }
                group.put("paths", pathStrings);
                duplicates.add(group);
            } catch (IOException ignored) {
            }
        }
        duplicates.sort((a, b) -> {
            long wa = ((long) a.get("sizeMB")) * (((List<?>) a.get("paths")).size() - 1);
            long wb = ((long) b.get("sizeMB")) * (((List<?>) b.get("paths")).size() - 1);
            return Long.compare(wb, wa);
        });
        if (duplicates.size() > MAX_DUPLICATE_GROUPS) {
            duplicates.subList(MAX_DUPLICATE_GROUPS, duplicates.size()).clear();
        }

        List<Map<String, Object>> cleanupCandidates = new ArrayList<>();
        addDirCleanupCandidate(cleanupCandidates, tempDir, "User temporary files");
        addDirCleanupCandidate(cleanupCandidates,
                userHome.resolve("AppData").resolve("Local").resolve("Temp"),
                "Application cache and temp data");
        addDirCleanupCandidate(cleanupCandidates, userHome.resolve("Downloads"), "Downloads folder review");

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("filesScanned", visited.get());
        stats.put("durationMs", System.currentTimeMillis() - start);
        stats.put("truncated", truncated[0]);

        Map<String, Object> scan = new LinkedHashMap<>();
        scan.put("drives", drives);
        scan.put("largeFiles", topLarge);
        scan.put("duplicateCandidates", duplicates);
        scan.put("cleanupCandidates", cleanupCandidates);
        scan.put("stats", stats);
        return scan;
    }

    private void addDirCleanupCandidate(List<Map<String, Object>> candidates, Path dir, String reason) {
        try {
            if (!Files.isDirectory(dir)) {
                return;
            }
            final AtomicLong size = new AtomicLong();
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (attrs.isRegularFile()) {
                        size.addAndGet(attrs.size());
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });
            Map<String, Object> candidate = new LinkedHashMap<>();
            candidate.put("path", dir.toString());
            candidate.put("sizeMB", size.get() / (1024L * 1024));
            candidate.put("reason", reason);
            candidates.add(candidate);
        } catch (Exception ignored) {
        }
    }
}
