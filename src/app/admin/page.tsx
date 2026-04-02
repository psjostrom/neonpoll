import { notFound } from "next/navigation";
import { GlobalAdmin } from "./GlobalAdmin";

export default async function GlobalAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    notFound();
  }

  return <GlobalAdmin token={token} />;
}
