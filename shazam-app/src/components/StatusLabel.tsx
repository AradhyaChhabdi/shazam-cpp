interface StatusLabelProps {
  children: React.ReactNode;
  className?: string;
}

export default function StatusLabel({ children, className = "" }: StatusLabelProps) {
  return (
    <p className={`status-label ${className}`}>
      {children}
    </p>
  );
}
