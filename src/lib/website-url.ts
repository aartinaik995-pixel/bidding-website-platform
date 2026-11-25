const blockedHostSuffixes = [
  ".localhost",
  ".local",
  ".internal",
  ".test",
  ".invalid",
  ".example",
];

function isPublicHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host.length > 253 ||
    !host.includes(".") ||
    host.includes(":") ||
    host.startsWith("[") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    blockedHostSuffixes.some((suffix) => host.endsWith(suffix))
  ) {
    return false;
  }

  return host.split(".").every((label) => {
    return (
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-")
    );
  });
}

/** Accepts only public http(s) domain URLs without embedded credentials or IP literals. */
export function isPublicWebsiteUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
}
