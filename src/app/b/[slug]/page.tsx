import { notFound } from "next/navigation";
import PublicBusinessPage from "@/app/b/[slug]/PublicBusinessPage";
import { dbGetPublicBusinessBySlug } from "@/lib/supabase-server";

export default async function BusinessBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await dbGetPublicBusinessBySlug(slug);
  if (!profile) notFound();

  return <PublicBusinessPage profile={profile} />;
}
