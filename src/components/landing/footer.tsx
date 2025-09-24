import { Logo } from '@/components/logo';

export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="border-t">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <Logo className="h-6 w-6 text-primary" />
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            &copy; {currentYear} Code Name - New. All rights reserved.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
            <p>Contact us at <a href="mailto:contact@codename.new" className="underline underline-offset-4 hover:text-primary">contact@codename.new</a></p>
        </div>
      </div>
    </footer>
  );
}
