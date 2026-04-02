import { notFound } from "next/navigation";
import { getConfig } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import { AdminPanel } from "./AdminPanel";

export default async function PollAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  const config = await getConfig(slug);
  if (!config) notFound();

  if (!token || !validatePollToken(token, config.adminToken)) {
    notFound();
  }

  return <AdminPanel slug={slug} token={token} />;
}
