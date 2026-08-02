import CompletionClient from "./CompletionClient";

export default async function CompletionPage({ params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  return <CompletionClient sessionToken={sessionToken} />;
}
