const DEFAULT_PROVIDER = Object.freeze({
  type: "relative",
  baseUrl: "."
});

function getProvider(catalog, providerId) {
  const providers = catalog?.mediaProviders || {};
  return providers[providerId] || (providerId === "bundled" ? DEFAULT_PROVIDER : null);
}

function assertSafeUrl(url, providerId) {
  if (!["http:", "https:", "file:"].includes(url.protocol)) {
    throw new Error(`Unsupported media URL protocol for provider ${providerId}`);
  }
  return url;
}

export function resolveMediaAsset(catalog, asset, legacyPathKeys = []) {
  if (!asset) throw new Error("A media asset is required");

  const delivery = asset.delivery || {};
  const providerId = delivery.provider || asset.provider || "bundled";
  const provider = getProvider(catalog, providerId);
  if (!provider) throw new Error(`Unknown media provider: ${providerId}`);

  const assetPath = delivery.path
    || asset.publicPath
    || legacyPathKeys.map((key) => asset[key]).find(Boolean);
  if (!assetPath) throw new Error(`No public path found for media provider ${providerId}`);

  if (provider.type === "absolute") {
    const providerBase = assertSafeUrl(new URL(provider.baseUrl), providerId);
    return assertSafeUrl(new URL(assetPath, providerBase), providerId).href;
  }

  if (provider.type !== "relative") {
    throw new Error(`Unsupported media provider type: ${provider.type}`);
  }

  const providerBase = new URL(provider.baseUrl || ".", document.baseURI);
  return assertSafeUrl(new URL(assetPath, providerBase), providerId).href;
}

export function resolveTrackAudio(catalog, track) {
  return resolveMediaAsset(catalog, track.audio, ["visualizerPath"]);
}

export function resolveReleaseArtwork(catalog, release) {
  return resolveMediaAsset(catalog, release.artwork, ["webPath", "visualizerPath"]);
}
