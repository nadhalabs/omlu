import MenuClient from "./MenuClient";

type Params = Promise<{ restaurantSlug: string; tableCode: string }>;

interface PageProps {
  params: Params;
}

export default async function MenuPage({ params }: PageProps) {
  const { restaurantSlug, tableCode } = await params;

  return <MenuClient restaurantSlug={restaurantSlug} tableCode={tableCode} />;
}
