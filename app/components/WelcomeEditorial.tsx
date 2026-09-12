import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpenText, Clock3 } from "lucide-react";
import type { WelcomeArticle, WelcomeBlock } from "../lib/welcome-content";
import { welcomeArticles } from "../lib/welcome-content";

export function WelcomeArticleCards({ baseHref, compact = false }: { baseHref: string; compact?: boolean }) {
  return <section className={`welcome-editorial-shelf ${compact ? "compact" : ""}`}>
    <header><div><span>2026 FRESHMAN GUIDE</span><h2>新生入校阅读指南</h2><p>已按报到、适应和心理服务分类，正文内容同时进入智能体知识库。</p></div><BookOpenText size={24}/></header>
    <div>{welcomeArticles.map((article) => <Link href={`${baseHref}/${article.slug}`} key={article.slug}>
      <figure><Image unoptimized src={article.cover.src} alt={article.cover.alt} width={article.cover.width} height={article.cover.height}/><figcaption>{article.category}</figcaption></figure>
      <span>{article.category} · {article.readingTime}</span>
      <h3>{article.shortTitle}</h3>
      <p>{article.intro}</p>
      <b>阅读全文 <ArrowUpRight size={14}/></b>
    </Link>)}</div>
  </section>;
}

function renderBlock(block: WelcomeBlock, index: number) {
  if (block.type === "heading") return <header className="welcome-story-section-head" key={index}><span>{block.eyebrow}</span><h2>{block.title}</h2></header>;
  if (block.type === "paragraph") return <p className="welcome-story-paragraph" key={index}>{block.text}</p>;
  if (block.type === "list") return <ul className="welcome-story-list" key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  if (block.type === "steps") return <ol className="welcome-story-steps" key={index}>{block.items.map((item, step) => <li key={item.title}><i>{String(step + 1).padStart(2, "0")}</i><div><b>{item.title}</b>{item.detail && <p>{item.detail}</p>}</div></li>)}</ol>;
  if (block.type === "callout") return <aside className="welcome-story-callout" key={index}><span>重点</span><div><b>{block.title}</b><p>{block.text}</p></div></aside>;
  if (block.type === "image") return <figure className={`welcome-story-image ${block.fit === "contain" ? "contain" : ""}`} key={index}><Image unoptimized src={block.src} alt={block.alt} width={block.width} height={block.height}/><figcaption>{block.caption}</figcaption></figure>;
  return <div className="welcome-story-gallery" key={index}>{block.images.map((item) => <figure key={item.src} className={item.fit === "contain" ? "contain" : ""}><Image unoptimized src={item.src} alt={item.alt} width={item.width} height={item.height}/><figcaption>{item.caption}</figcaption></figure>)}</div>;
}

export function WelcomeArticleView({ article, backHref, student = false }: { article: WelcomeArticle; backHref: string; student?: boolean }) {
  return <main className={`welcome-story-page ${student ? "student" : ""}`}>
    <div className="welcome-story-topline"><Link href={backHref}><ArrowLeft size={15}/>返回迎新主页</Link><span>{article.category}</span></div>
    <article className="welcome-story">
      <header className="welcome-story-hero">
        <span>{article.category}</span>
        <h1>{article.title}</h1>
        <p>{article.intro}</p>
        <div><span><Clock3 size={13}/>{article.readingTime}</span><span>面向 2026 级新生</span></div>
      </header>
      <figure className={`welcome-story-cover ${article.cover.fit === "contain" ? "contain" : ""}`}><Image unoptimized src={article.cover.src} alt={article.cover.alt} width={article.cover.width} height={article.cover.height} priority/><figcaption>{article.cover.caption}</figcaption></figure>
      <div className="welcome-story-body">{article.blocks.map(renderBlock)}</div>
      <footer><span>资料来源</span><b>{article.source}</b><p>{article.editorNote}</p></footer>
    </article>
  </main>;
}
