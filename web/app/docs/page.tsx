import { Metadata } from "next";
import DocsClient from "./DocsClient";

export const metadata: Metadata = {
  title: "Documentation | StakePoint",
  description: "Complete guide to staking on StakePoint - Learn how to stake, create pools, earn rewards, and more.",
};

export default function DocsPage() {
  return <DocsClient />;
}

