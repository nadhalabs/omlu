import CompletionClient from "./CompletionClient";

export default async function CompletionPage({ params, searchParams }: { params: Promise<{ sessionToken: string }>; searchParams: Promise<{ receipt?: string }> }) {
  const { sessionToken } = await params;
  const { receipt } = await searchParams;
  return <CompletionClient sessionToken={sessionToken} receiptToken={receipt} />;
}
