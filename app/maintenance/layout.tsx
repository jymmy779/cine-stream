export default function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body style={{ margin: 0, padding: 0, background: '#0f1115' }}>
        {children}
      </body>
    </html>
  );
}
