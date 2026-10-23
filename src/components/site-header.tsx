import { Link } from '@tanstack/react-router'
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { BrandMark } from '@/components/brand'
import { useIdentity } from '@/components/identity-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const nav = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/dashboard', label: 'Dashboard' },
] as const

function AccountMenu() {
  const { user, ready, signOut } = useIdentity()
  if (!ready) return <span aria-hidden className="hidden h-9 w-20 sm:block" />
  if (!user) {
    return (
      <Button asChild variant="ghost" className="hidden sm:inline-flex">
        <Link to="/login">Sign in</Link>
      </Button>
    )
  }
  const isAdmin = user.roles?.includes('admin')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="hidden max-w-48 sm:inline-flex">
          <UserRound />
          <span className="truncate">{user.name || 'Account'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard">
            <LayoutDashboard /> Dashboard
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck /> Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileAccountLinks() {
  const { user, ready, signOut } = useIdentity()
  if (!ready) return null
  if (!user) {
    return (
      <SheetClose asChild>
        <Link
          to="/login"
          className="rounded-md px-3 py-3 text-base font-medium hover:bg-secondary"
        >
          Sign in
        </Link>
      </SheetClose>
    )
  }
  return (
    <>
      {user.roles?.includes('admin') && (
        <SheetClose asChild>
          <Link
            to="/admin"
            className="rounded-md px-3 py-3 text-base font-medium hover:bg-secondary"
            activeProps={{ className: 'bg-secondary text-primary' }}
          >
            Admin
          </Link>
        </SheetClose>
      )}
      <SheetClose asChild>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md px-3 py-3 text-left text-base font-medium hover:bg-secondary"
        >
          Sign out
        </button>
      </SheetClose>
    </>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 sm:px-6">
        <BrandMark />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
              activeProps={{ className: 'text-foreground bg-secondary' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <AccountMenu />
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/submit">
              <Plus /> Submit your site
            </Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>Navigate BidMySite</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {[{ to: '/', label: 'Home' } as const, ...nav].map((item) => (
                  <SheetClose asChild key={item.to}>
                    <Link
                      to={item.to}
                      className="rounded-md px-3 py-3 text-base font-medium hover:bg-secondary"
                      activeProps={{ className: 'bg-secondary text-primary' }}
                      activeOptions={{ exact: item.to === '/' }}
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
                <MobileAccountLinks />
                <SheetClose asChild>
                  <Button asChild className="mt-4">
                    <Link to="/submit">
                      <Plus /> Submit your site
                    </Link>
                  </Button>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
