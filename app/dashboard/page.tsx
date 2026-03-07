import DashboardLayout from "@/components/DashboardLayout";
import { loadDashboardData } from "@/lib/dashboard";

export default async function DashboardPage() {
  const data = await loadDashboardData();

  return <DashboardLayout initialData={data} />;
}
