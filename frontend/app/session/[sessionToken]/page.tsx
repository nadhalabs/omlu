import SessionClient from "./SessionClient";

type Params = Promise<{ sessionToken: string }>;

interface PageProps {
  params: Params;
}

export default async function SessionPage({ params }: PageProps) {
  const { sessionToken } = await params;
  return <SessionClient sessionToken={sessionToken} />;
}
