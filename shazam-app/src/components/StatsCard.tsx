interface StatsCardProps {
  label: string;
  value: string;
  subtitle: string;
}

export default function StatsCard({ label, value, subtitle }: StatsCardProps) {
  return (
    <div className="card-surface p-5">
      <p className="form-label mb-3">{label}</p>
      <p className="text-3xl font-semibold text-white tracking-tight">{value}</p>
      <p className="text-sm text-resonate-dim mt-1">{subtitle}</p>
    </div>
  );
}
