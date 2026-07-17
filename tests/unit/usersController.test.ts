import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const asyncHandlerPath = "express-async-handler";
const prismaPath = "../../src/db/prisma.js";
const publicUserSelectPath = "../../src/utils/publicUserSelect.js";
const usersControllerPath = "../../src/controllers/usersController.js";

type TestUser = {
  id: number;
  role?: "ADMIN" | "USER";
};

type TestRequest = Partial<Request> & {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  user?: TestUser;
};

function createRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

async function loadUsersController() {
  vi.resetModules();

  const prismaClient = {
    address: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    user: {
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  const publicUserSelect = {
    id: true,
    name: true,
    email: true,
    emailVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
    role: true,
    defaultShippingAddress: true,
    defaultBillingAddress: true,
  };

  vi.doMock(asyncHandlerPath, () => ({
    default: <T extends (...args: any[]) => any>(fn: T) => fn,
  }));

  vi.doMock(prismaPath, () => ({
    prismaClient,
  }));

  vi.doMock(publicUserSelectPath, () => ({
    publicUserSelect,
  }));

  const mod = await import(usersControllerPath);

  return {
    ...mod,
    mocks: {
      prismaClient,
      publicUserSelect,
    },
  };
}

describe("usersController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("updateUserCtrl", () => {
    it("returns 400 when provided defaultShippingAddress does not belong to user", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const req = {
        body: { defaultShippingAddress: 10 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        userId: 999,
      });

      await expect(updateUserCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Address does not belong to user!",
      });
    });

    it("returns 400 when provided defaultBillingAddress does not belong to user", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const req = {
        body: { defaultBillingAddress: 20 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow.mockResolvedValue({
        id: 20,
        userId: 999,
      });

      await expect(updateUserCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Address does not belong to user!",
      });
    });

    it("proceeds when defaultShippingAddress belongs to user", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 1,
        name: "Mina",
        defaultShippingAddress: 10,
      };

      const req = {
        body: { defaultShippingAddress: 10 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        userId: 1,
      });
      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await updateUserCtrl(req, res);

      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          defaultShippingAddress: 10,
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("proceeds when defaultBillingAddress belongs to user", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 1,
        name: "Mina",
        defaultBillingAddress: 20,
      };

      const req = {
        body: { defaultBillingAddress: 20 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow.mockResolvedValue({
        id: 20,
        userId: 1,
      });
      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await updateUserCtrl(req, res);

      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          defaultBillingAddress: 20,
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("supports partial update with only name", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 1,
        name: "New Name",
      };

      const req = {
        body: { name: "New Name" },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await updateUserCtrl(req, res);

      expect(
        mocks.prismaClient.address.findUniqueOrThrow,
      ).not.toHaveBeenCalled();
      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: "New Name",
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("supports partial update with only defaultShippingAddress", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 1,
        defaultShippingAddress: 10,
      };

      const req = {
        body: { defaultShippingAddress: 10 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        userId: 1,
      });
      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await updateUserCtrl(req, res);

      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          defaultShippingAddress: 10,
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("supports partial update with only defaultBillingAddress", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 1,
        defaultBillingAddress: 20,
      };

      const req = {
        body: { defaultBillingAddress: 20 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow.mockResolvedValue({
        id: 20,
        userId: 1,
      });
      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await updateUserCtrl(req, res);

      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          defaultBillingAddress: 20,
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("supports combined update and returns selected public user", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 1,
        name: "New Name",
        defaultShippingAddress: 10,
        defaultBillingAddress: 20,
        role: "USER",
      };

      const req = {
        body: {
          name: "New Name",
          defaultShippingAddress: 10,
          defaultBillingAddress: 20,
        },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.address.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 10,
          userId: 1,
        })
        .mockResolvedValueOnce({
          id: 20,
          userId: 1,
        });

      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await updateUserCtrl(req, res);

      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: "New Name",
          defaultShippingAddress: 10,
          defaultBillingAddress: 20,
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("rethrows findUniqueOrThrow error when address does not exist", async () => {
      const { updateUserCtrl, mocks } = await loadUsersController();

      const req = {
        body: { defaultShippingAddress: 999 },
        user: { id: 1 },
      } as TestRequest as Request;

      const res = createRes();

      const prismaError = new Error("No Address found");
      mocks.prismaClient.address.findUniqueOrThrow.mockRejectedValue(
        prismaError,
      );

      await expect(updateUserCtrl(req, res)).rejects.toThrow(
        "No Address found",
      );
    });
  });

  describe("changeUserRoleCtrl", () => {
    it("updates user role and returns updated user", async () => {
      const { changeUserRoleCtrl, mocks } = await loadUsersController();

      const updatedUser = {
        id: 2,
        name: "Mina",
        email: "mina@test.com",
        role: "ADMIN",
      };

      const req = {
        params: { id: "2" },
        body: { role: "ADMIN" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.user.update.mockResolvedValue(updatedUser);

      await changeUserRoleCtrl(req, res);

      expect(mocks.prismaClient.user.update).toHaveBeenCalledWith({
        where: {
          id: 2,
        },
        data: {
          role: "ADMIN",
        },
        select: mocks.publicUserSelect,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it("returns 404 when user update throws because user is missing", async () => {
      const { changeUserRoleCtrl, mocks } = await loadUsersController();

      const req = {
        params: { id: "2" },
        body: { role: "ADMIN" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.user.update.mockRejectedValue(new Error("not found"));

      await expect(changeUserRoleCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "User Not Found!",
      });
    });
  });

  describe("getUserByIdCtrl", () => {
    it("returns 400 for invalid id", async () => {
      const { getUserByIdCtrl } = await loadUsersController();

      const req = {
        params: { id: "abc" },
      } as TestRequest as Request;

      const res = createRes();

      await expect(getUserByIdCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid user id",
      });
    });

    it("returns 404 when user is not found", async () => {
      const { getUserByIdCtrl, mocks } = await loadUsersController();

      const req = {
        params: { id: "5" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.user.findUnique.mockResolvedValue(null);

      await expect(getUserByIdCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "User Not Found!",
      });
    });

    it("returns user with addresses on success", async () => {
      const { getUserByIdCtrl, mocks } = await loadUsersController();

      const user = {
        id: 5,
        name: "Mina",
        email: "mina@test.com",
        role: "USER",
        addresses: [
          {
            id: 1,
            lineOne: "123 Main",
            city: "Casa",
          },
        ],
      };

      const req = {
        params: { id: "5" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.user.findUnique.mockResolvedValue(user);

      await getUserByIdCtrl(req, res);

      expect(mocks.prismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { id: 5 },
        select: {
          ...mocks.publicUserSelect,
          addresses: true,
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(user);
    });
  });
});
