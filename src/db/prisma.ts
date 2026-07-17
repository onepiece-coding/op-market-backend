import { PrismaClient } from "@prisma/client";

type AddressForFormatted = {
  lineOne: string;
  lineTwo: string | null;
  city: string;
  country: string;
  pincode: string;
};

export const prismaClient = new PrismaClient({
  log: process.env.NODE_ENV === "test" ? [] : ["query"],
}).$extends({
  result: {
    address: {
      formattedAddress: {
        needs: {
          lineOne: true,
          lineTwo: true,
          city: true,
          country: true,
          pincode: true,
        },
        compute: (addr: AddressForFormatted) => {
          const parts: string[] = [];
          if (addr.lineOne) parts.push(addr.lineOne);
          if (addr.lineTwo) parts.push(addr.lineTwo);
          if (addr.city) parts.push(addr.city);

          const countryPincode = [addr.country, addr.pincode]
            .filter(Boolean)
            .join("-");

          if (countryPincode) parts.push(countryPincode);

          return parts.join(", ");
        },
      },
    },
  },
});
