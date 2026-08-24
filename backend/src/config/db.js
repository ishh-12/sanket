import mongoose from 'mongoose';

const connectDB = async () => {
  // MONGODB_URI is the canonical variable; MONGO_URI is the accepted legacy fallback.
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is not set. Copy backend/.env.example to backend/.env and configure it.'
    );
  }

  console.log('[MongoDB] Connecting...');

  mongoose.connection.on('connected', () => {
    console.log(`[MongoDB] Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[MongoDB] Connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.error('[MongoDB] Disconnected from database');
  });

  const connectOptions = {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  };

  // Primary attempt with the configured URI.
  try {
    await mongoose.connect(mongoUri, connectOptions);
    return; // success
  } catch (primaryError) {
    // If the primary URI uses the +srv scheme and the SRV lookup failed,
    // derive a direct replica set URI from the known Atlas shard hosts and retry.
    // This handles environments where the local DNS server does not resolve SRV records
    // (common in corporate networks or ISPs that filter SRV/TXT lookups).
    if (
      primaryError.message &&
      (primaryError.message.includes('querySrv') ||
        primaryError.message.includes('ECONNREFUSED') ||
        primaryError.message.includes('ENOTFOUND')) &&
      mongoUri.startsWith('mongodb+srv://')
    ) {
      console.warn(
        '[MongoDB] SRV lookup failed — the local DNS server may not support SRV records.'
      );
      console.warn('[MongoDB] Retrying with direct-host connection URI...');

      const directUri = buildDirectUri(mongoUri);
      if (directUri) {
        try {
          await mongoose.connect(directUri, connectOptions);
          console.log('[MongoDB] Connected via direct-host fallback URI.');
          return; // success on fallback
        } catch (fallbackError) {
          console.error(`[MongoDB] Direct-host fallback also failed: ${fallbackError.message}`);
          // Throw the original error for the most useful startup message.
          throw primaryError;
        }
      }
    }

    console.error(`[MongoDB] Initial connection failed: ${primaryError.message}`);
    throw primaryError;
  }
};

/**
 * Converts a mongodb+srv:// URI to a direct mongodb:// replica set URI.
 * This is used as a DNS-fallback when SRV lookup fails.
 *
 * Input:  mongodb+srv://user:pass@cluster0.0djgdar.mongodb.net/?appName=Cluster0
 * Output: mongodb://user:pass@ac-fh5jcie-shard-00-00.0djgdar.mongodb.net:27017,...
 *         ?ssl=true&replicaSet=atlas-<hash>-shard-0&authSource=admin&appName=Cluster0
 *
 * The shard hostnames are derived deterministically from the Atlas cluster hostname pattern.
 */
function buildDirectUri(srvUri) {
  try {
    // Extract credentials and cluster ID from the SRV URI.
    // Pattern: mongodb+srv://user:pass@cluster0.<clusterid>.mongodb.net/...
    const match = srvUri.match(
      /^mongodb\+srv:\/\/([^@]+)@([^/]+\.([a-z0-9]+)\.mongodb\.net)(\/.*)?$/i
    );
    if (!match) return null;

    const credentials = match[1];          // user:pass
    const clusterHost = match[2];          // cluster0.0djgdar.mongodb.net
    const clusterId = match[3];            // 0djgdar  (the unique Atlas cluster ID)
    const rest = match[4] || '/';          // /database?options

    // Build the three standard Atlas shard hostnames.
    // Atlas always uses ac-<hash>-shard-00-0{0,1,2}.<clusterId>.mongodb.net
    // We hardcode the known shards for this specific Atlas cluster.
    // If the cluster ID changes (new Atlas cluster), update MONGODB_URI in .env.
    const KNOWN_SHARDS = {
      '0djgdar': [
        'ac-fh5jcie-shard-00-00.0djgdar.mongodb.net',
        'ac-fh5jcie-shard-00-01.0djgdar.mongodb.net',
        'ac-fh5jcie-shard-00-02.0djgdar.mongodb.net',
      ],
    };

    const shards = KNOWN_SHARDS[clusterId];
    if (!shards) {
      // Unknown cluster — cannot derive shards statically.
      return null;
    }

    const hosts = shards.map((h) => `${h}:27017`).join(',');

    // Preserve any existing query params from the SRV URI.
    const qIdx = rest.indexOf('?');
    const dbPart = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
    const existingParams = qIdx >= 0 ? rest.slice(qIdx + 1) : '';

    const params = new URLSearchParams(existingParams);
    params.set('ssl', 'true');
    params.set('tls', 'true');
    params.set('authSource', 'admin');

    return `mongodb://${credentials}@${hosts}${dbPart || '/'}?${params.toString()}`;
  } catch {
    return null;
  }
}

export default connectDB;
