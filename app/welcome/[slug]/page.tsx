import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalShell } from "../../components/PortalShell";
import { WelcomeArticleView } from "../../components/WelcomeEditorial";
import { getWelcomeArticle } from "../../lib/welcome-content";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = getWelcomeArticle((await params).slug);
  return { title: article?.shortTitle || "迎新指南" };
}

export default async function WelcomeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getWelcomeArticle((await params).slug);
  if (!article) notFound();
  return <PortalShell><WelcomeArticleView article={article} backHref="/welcome"/></PortalShell>;
}
