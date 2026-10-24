import { describe, expect, it } from "vitest";

import { isPublicWebsiteUrl } from "./website-url";

describe("public website URL validation", () => {
  it("accepts public http and https domain URLs", () => {
    expect(isPublicWebsiteUrl("https://example.com/path")).toBe(true);
    expect(isPublicWebsiteUrl("http://sub.example.org")).toBe(true);
  });

  it("rejects non-web protocols and embedded credentials", () => {
    expect(isPublicWebsiteUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicWebsiteUrl("ftp://example.com")).toBe(false);
    expect(isPublicWebsiteUrl("https://user:pass@example.com")).toBe(false);
  });

  it("rejects local, reserved, and IP-literal hosts", () => {
    expect(isPublicWebsiteUrl("http://localhost")).toBe(false);
    expect(isPublicWebsiteUrl("http://printer.local")).toBe(false);
    expect(isPublicWebsiteUrl("http://192.168.1.4")).toBe(false);
    expect(isPublicWebsiteUrl("http://127.1")).toBe(false);
    expect(isPublicWebsiteUrl("http://[::1]")).toBe(false);
  });
});
