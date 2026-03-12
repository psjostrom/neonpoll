import { notFound } from "next/navigation";
import { AdminPanel } from "./AdminPanel";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    notFound();
  }

  return <AdminPanel token={token} />;
}
