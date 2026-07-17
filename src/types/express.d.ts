import type { Prisma } from "@prisma/client";
import { publicUserSelect } from "../utils/publicUserSelect.js";

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}
