import { Metadata } from "next";
import { PrismaClient } from "@prisma/client";
import LandingPage from "@/components/LandingPage";

const prisma = new PrismaClient();

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await prisma.sEO.findUnique({
      where: { page: "landing" },
    });

    if (seo) {
      return {
        title: seo.title,
        description: seo.description,
        keywords: seo.keywords || undefined,
        openGraph: {
          title: seo.ogTitle || seo.title,
          description: seo.ogDescription || seo.description,
          images: seo.ogImage ? [seo.ogImage] : ['/og-image.png'],
          type: "website",
        },
        twitter: {
          card: (seo.twitterCard as any) || "summary_large_image",
          title: seo.twitterTitle || seo.title,
          description: seo.twitterDescription || seo.description,
          images: seo.twitterImage ? [seo.twitterImage] : ['/og-image.png'],
        },
        alternates: {
          canonical: seo.canonicalUrl || undefined,
        },
      };
    }
  } catch (error) {
    console.error("Failed to fetch SEO data:", error);
  }

  // Default metadata if no SEO data found
  return {
    title: "StakePoint - Stake Your Crypto & Earn Rewards | Solana Staking",
    description:
      "Stake your Solana tokens and earn industry-leading APYs. Flexible lock periods, instant rewards, and reflection tokens. Join thousands earning passive income.",
    keywords: "solana, staking, defi, crypto, rewards, apy, blockchain, passive income",
    openGraph: {
      title: "StakePoint - Stake Your Crypto & Earn Rewards",
      description: "The most advanced staking platform on Solana. Earn passive income with high APYs.",
      type: "website",
      images: ['/og-image.png'],
    },
    twitter: {
      card: "summary_large_image",
      title: "StakePoint - Stake Your Crypto & Earn Rewards",
      description: "The most advanced staking platform on Solana. Earn passive income with high APYs.",
      images: ['/og-image.png'],
    },
  };
}

export default function LandingPageRoute() {
  return <LandingPage />;
}