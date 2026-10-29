import { PageContainer } from "@/components/shared/states";
import { AccountNav } from "@/features/account/components/account-nav";

/** Layout is static chrome only; each page performs its own auth check (layouts don't re-run on navigation). */
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <PageContainer>
      <AccountNav />
      {children}
    </PageContainer>
  );
}
