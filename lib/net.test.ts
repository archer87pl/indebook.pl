import { describe, expect, it } from "vitest";
import { isPrivateIp } from "./net";

describe("isPrivateIp", () => {
  it("wykrywa adresy prywatne / wewnętrzne IPv4", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("przepuszcza adresy publiczne IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("wykrywa loopback i zakresy prywatne IPv6 (w tym IPv4-mapowane)", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("przepuszcza publiczne IPv6 i mapowane publiczne IPv4", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("zniekształcony oktet traktuje jako niebezpieczny", () => {
    expect(isPrivateIp("999.1.1.1")).toBe(true);
  });
});
