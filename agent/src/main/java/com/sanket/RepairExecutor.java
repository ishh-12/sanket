package com.sanket;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

public class RepairExecutor {

    public static class Result {
        public boolean success;
        public String output;
        public String error;
        public long durationMs;

        public Result(boolean success, String output, String error, long durationMs) {
            this.success = success;
            this.output = output;
            this.error = error;
            this.durationMs = durationMs;
        }
    }

    public Result execute(String repairId) {
        Instant start = Instant.now();
        try {
            Result result = switch (repairId) {
                case "refresh_dns_cache" -> refreshDnsCache();
                case "clear_temp_files" -> clearTempFiles();
                default -> new Result(false, null, "Unknown repair operation: " + repairId, 0);
            };
            long elapsed = Duration.between(start, Instant.now()).toMillis();
            return new Result(result.success, result.output, result.error, elapsed);
        } catch (Exception e) {
            long elapsed = Duration.between(start, Instant.now()).toMillis();
            return new Result(false, null, e.getMessage(), elapsed);
        }
    }

    private Result refreshDnsCache() throws Exception {
        ProcessBuilder pb = new ProcessBuilder("ipconfig", "/flushdns");
        pb.redirectErrorStream(true);
        Process process = pb.start();

        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append('\n');
            }
        }

        int exitCode = process.waitFor(30, java.util.concurrent.TimeUnit.SECONDS)
                ? process.exitValue()
                : -1;

        if (exitCode == 0) {
            return new Result(true, output.toString().trim(), null,
                    Duration.between(Instant.now(), Instant.now()).toMillis());
        }
        return new Result(false, output.toString().trim(), "ipconfig exited with code " + exitCode, 0);
    }

    private Result clearTempFiles() {
        String tempDir = System.getProperty("java.io.tmpdir");
        Path tempPath = Path.of(tempDir);
        if (!Files.isDirectory(tempPath)) {
            return new Result(false, null, "Temporary directory not found: " + tempDir, 0);
        }

        final int[] deleted = {0};
        final int[] skipped = {0};
        final long cutoff = System.currentTimeMillis() - java.time.Duration.ofHours(24).toMillis();
        // 30-second deadline to prevent the walk from hanging the agent thread.
        final long deadline = System.currentTimeMillis() + 30_000;

        // Use walkFileTree (not Files.walk) so that AccessDeniedException on individual
        // directories is handled gracefully via visitFileFailed rather than crashing the stream.
        try {
            Files.walkFileTree(tempPath, new java.nio.file.SimpleFileVisitor<>() {
                @Override
                public java.nio.file.FileVisitResult preVisitDirectory(Path dir, java.nio.file.attribute.BasicFileAttributes attrs) {
                    if (System.currentTimeMillis() > deadline) {
                        return java.nio.file.FileVisitResult.TERMINATE;
                    }
                    return java.nio.file.FileVisitResult.CONTINUE;
                }

                @Override
                public java.nio.file.FileVisitResult visitFile(Path file, java.nio.file.attribute.BasicFileAttributes attrs) {
                    if (System.currentTimeMillis() > deadline) {
                        return java.nio.file.FileVisitResult.TERMINATE;
                    }
                    try {
                        if (attrs.isRegularFile() && attrs.lastModifiedTime().toMillis() < cutoff) {
                            if (Files.deleteIfExists(file)) {
                                deleted[0]++;
                            }
                        }
                    } catch (java.nio.file.AccessDeniedException e) {
                        skipped[0]++;
                    } catch (Exception e) {
                        skipped[0]++;
                    }
                    return java.nio.file.FileVisitResult.CONTINUE;
                }

                @Override
                public java.nio.file.FileVisitResult visitFileFailed(Path file, IOException exc) {
                    // Skip inaccessible files/directories (SYSTEM-owned on Windows).
                    skipped[0]++;
                    return java.nio.file.FileVisitResult.CONTINUE;
                }

                @Override
                public java.nio.file.FileVisitResult postVisitDirectory(Path dir, IOException exc) {
                    if (!dir.equals(tempPath)) {
                        try {
                            Files.deleteIfExists(dir); // remove empty directories
                        } catch (Exception ignored) {
                        }
                    }
                    return java.nio.file.FileVisitResult.CONTINUE;
                }
            });
        } catch (Exception e) {
            // Any unrecoverable walk error — return partial success with what we did.
            String summary = "Partially cleaned " + tempDir + ": deleted " + deleted[0]
                    + " file(s). Walk interrupted: " + e.getMessage();
            return new Result(true, summary, null, 0);
        }

        String summary = "Deleted " + deleted[0] + " file(s) older than 24h from "
                + tempDir + ". " + skipped[0] + " item(s) skipped (access denied or locked).";
        return new Result(true, summary, null, 0);
    }
}
