import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../helpers/prisma.js";
import { authHeaderFor } from "../helpers/auth.js";
import {
  createAddress,
  createAdmin,
  createVerifiedUser,
} from "../helpers/factories.js";

describe("Users routes integration", () => {
  describe("address endpoints", () => {
    it("returns 401 for unauthenticated GET, POST, and DELETE", async () => {
      const listRes = await request(app).get("/api/v1/users/address");
      expect(listRes.status).toBe(401);
      expect(listRes.body.message).toBe("Unauthorized!");

      const createRes = await request(app).post("/api/v1/users/address").send({
        lineOne: "123 Main St",
        city: "Casablanca",
        country: "MA",
        pincode: "12345",
      });
      expect(createRes.status).toBe(401);
      expect(createRes.body.message).toBe("Unauthorized!");

      const deleteRes = await request(app).delete("/api/v1/users/address/1");
      expect(deleteRes.status).toBe(401);
      expect(deleteRes.body.message).toBe("Unauthorized!");
    });

    it("adds an address with valid payload", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/users/address")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          lineOne: "123 Main St",
          lineTwo: "Apt 4",
          city: "Casablanca",
          country: "MA",
          pincode: "12345",
        });

      expect(res.status).toBe(201);
      expect(res.body.lineOne).toBe("123 Main St");
      expect(res.body.lineTwo).toBe("Apt 4");
      expect(res.body.userId).toBe(user.id);
    });

    it("returns 400 for invalid address payload", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/users/address")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          lineOne: "123 Main St",
          city: "Casablanca",
          country: "MA",
          pincode: "12",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("lists only the current user's addresses", async () => {
      const { user: userA } = await createVerifiedUser({
        email: "usera@test.com",
      });
      const { user: userB } = await createVerifiedUser({
        email: "userb@test.com",
      });

      await createAddress(userA.id, { lineOne: "User A Address 1" });
      await createAddress(userA.id, { lineOne: "User A Address 2" });
      await createAddress(userB.id, { lineOne: "User B Address 1" });

      const res = await request(app)
        .get("/api/v1/users/address")
        .set("Authorization", authHeaderFor(userA.id));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(
        res.body.every((a: { userId: number }) => a.userId === userA.id),
      ).toBe(true);
      expect(
        res.body.map((a: { lineOne: string }) => a.lineOne).sort(),
      ).toEqual(["User A Address 1", "User A Address 2"]);
    });

    it("deletes own address", async () => {
      const { user } = await createVerifiedUser();
      const address = await createAddress(user.id);

      const res = await request(app)
        .delete(`/api/v1/users/address/${address.id}`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Address deleted successfully");

      const deleted = await prisma.address.findUnique({
        where: { id: address.id },
      });
      expect(deleted).toBeNull();
    });

    it("returns 404 when deleting another user's address", async () => {
      const { user: owner } = await createVerifiedUser({
        email: "owner@test.com",
      });
      const { user: other } = await createVerifiedUser({
        email: "other@test.com",
      });
      const address = await createAddress(owner.id);

      const res = await request(app)
        .delete(`/api/v1/users/address/${address.id}`)
        .set("Authorization", authHeaderFor(other.id));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Address not found!");
    });

    it("returns 400 for invalid address id", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .delete("/api/v1/users/address/not-a-number")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid address id");
    });
  });

  describe("update current user", () => {
    it("updates name successfully", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          name: "Updated Name",
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Name");

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updated?.name).toBe("Updated Name");
    });

    it("sets defaultShippingAddress to user's own address", async () => {
      const { user } = await createVerifiedUser();
      const address = await createAddress(user.id);

      const res = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          defaultShippingAddress: address.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.defaultShippingAddress).toBe(address.id);

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updated?.defaultShippingAddress).toBe(address.id);
    });

    it("sets defaultBillingAddress to user's own address", async () => {
      const { user } = await createVerifiedUser();
      const address = await createAddress(user.id);

      const res = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          defaultBillingAddress: address.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.defaultBillingAddress).toBe(address.id);

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updated?.defaultBillingAddress).toBe(address.id);
    });

    it("returns 400 when setting another user's address", async () => {
      const { user } = await createVerifiedUser({
        email: "me@test.com",
      });
      const { user: other } = await createVerifiedUser({
        email: "other-address@test.com",
      });
      const otherAddress = await createAddress(other.id);

      const shippingRes = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          defaultShippingAddress: otherAddress.id,
        });

      expect(shippingRes.status).toBe(400);
      expect(shippingRes.body.message).toBe("Address does not belong to user!");

      const billingRes = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          defaultBillingAddress: otherAddress.id,
        });

      expect(billingRes.status).toBe(400);
      expect(billingRes.body.message).toBe("Address does not belong to user!");
    });

    it("returns 400 for invalid body", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          defaultShippingAddress: "abc",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("returns 500 for non-existent address with current implementation", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .put("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          defaultShippingAddress: 999999,
        });

      expect(res.status).toBe(500);
      expect(typeof res.body.message).toBe("string");
    });
  });

  describe("admin-only endpoints", () => {
    it("returns 403 for non-admin GET /api/v1/users", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .get("/api/v1/users")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Forbidden: admin only");
    });

    it("admin GET /api/v1/users returns paginated users with correct metadata", async () => {
      const { user: admin } = await createAdmin({
        email: "admin-users@test.com",
      });

      await createVerifiedUser({ email: "user1@test.com" });
      await createVerifiedUser({ email: "user2@test.com" });
      await createVerifiedUser({ email: "user3@test.com" });

      const res = await request(app)
        .get("/api/v1/users?page=1&limit=2")
        .set("Authorization", authHeaderFor(admin.id));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.current).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.results).toBe(4);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it("admin GET /api/v1/users/:id returns user with addresses, 400 for invalid id, and 404 for missing user", async () => {
      const { user: admin } = await createAdmin({
        email: "admin-detail@test.com",
      });
      const { user } = await createVerifiedUser({
        email: "detail-user@test.com",
      });
      await createAddress(user.id, { lineOne: "Address 1" });
      await createAddress(user.id, { lineOne: "Address 2" });

      const okRes = await request(app)
        .get(`/api/v1/users/${user.id}`)
        .set("Authorization", authHeaderFor(admin.id));

      expect(okRes.status).toBe(200);
      expect(okRes.body.id).toBe(user.id);
      expect(okRes.body.email).toBe(user.email);
      expect(Array.isArray(okRes.body.addresses)).toBe(true);
      expect(okRes.body.addresses).toHaveLength(2);

      const invalidRes = await request(app)
        .get("/api/v1/users/not-a-number")
        .set("Authorization", authHeaderFor(admin.id));

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.message).toBe("Invalid user id");

      const missingRes = await request(app)
        .get("/api/v1/users/999999")
        .set("Authorization", authHeaderFor(admin.id));

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.message).toBe("User Not Found!");
    });

    it("admin PUT /api/v1/users/:id/role updates role, returns 400 for invalid role, and 404 for missing user", async () => {
      const { user: admin } = await createAdmin({
        email: "admin-role@test.com",
      });
      const { user } = await createVerifiedUser({
        email: "change-role@test.com",
      });

      const okRes = await request(app)
        .put(`/api/v1/users/${user.id}/role`)
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          role: "ADMIN",
        });

      expect(okRes.status).toBe(200);
      expect(okRes.body.role).toBe("ADMIN");

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updated?.role).toBe("ADMIN");

      const invalidRes = await request(app)
        .put(`/api/v1/users/${user.id}/role`)
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          role: "SUPER_ADMIN",
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.message).toBe("Validation failed");
      expect(Array.isArray(invalidRes.body.errors)).toBe(true);

      const missingRes = await request(app)
        .put("/api/v1/users/999999/role")
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          role: "USER",
        });

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.message).toBe("User Not Found!");
    });
  });
});
