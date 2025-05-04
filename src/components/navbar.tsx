"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/client";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  MessageSquare,
  PanelLeft,
  User,
  Search,
  X,
  FileSymlink,
  Home,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/hooks/use-unread-messages";

export function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const supabase = createClient();
  const { totalUnread } = useUnreadMessages();

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };

    fetchUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const closeMenu = () => setIsMenuOpen(false);

  // Define navigation items
  const navigationItems = [
    { name: "Home", href: "/", icon: <Home className='h-5 w-5' /> },
    {
      name: "Browse Items",
      href: "/items",
      icon: <Search className='h-5 w-5' />,
    },
    {
      name: "Report Item",
      href: "/report",
      icon: <FileSymlink className='h-5 w-5' />,
    },
    {
      name: "Messages",
      href: "/messages",
      icon: <MessageSquare className='h-5 w-5' />,
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
  ];

  return (
    <nav className='border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50 shadow-sm'>
      <div className='container max-w-7xl flex h-16 items-center justify-between px-4 md:px-6'>
        {/* Logo */}
        <Link
          href='/'
          className='flex items-center gap-2 font-bold text-xl transition-transform hover:scale-105'
        >
          <span className='text-primary'>IFound4U</span>
        </Link>

        {/* Desktop navigation */}
        <div className='hidden md:flex items-center gap-8'>
          {navigationItems.map((item) => {
            // Check if the current pathname starts with the nav item's href
            // This handles both exact matches and child routes
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium transition-colors relative group",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                {item.name}
                {item.badge && <Badge className='ml-2'>{item.badge}</Badge>}
                <span
                  className={cn(
                    "absolute bottom-[-18px] left-0  bg-primary transform transition-transform duration-200",
                    isActive
                      ? "scale-x-100 w-full h-0.5" // Always show for active route
                      : "scale-x-0 group-hover:scale-x-100" // Only show on hover for inactive routes
                  )}
                />
              </Link>
            );
          })}
        </div>

        {/* User menu for desktop */}
        <div className='hidden md:flex items-center gap-5'>
          {user ? (
            <div className='flex items-center gap-5'>
              <Button
                variant='ghost'
                size='icon'
                asChild
                className='hover:bg-accent/50'
              >
                <Link href='/messages'>
                  <MessageSquare className='h-5 w-5' />
                  {totalUnread > 0 && (
                    <Badge className='ml-2'>{totalUnread}</Badge>
                  )}
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='rounded-full hover:bg-accent/50'
                  >
                    <User className='h-5 w-5' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-56 shadow-md'>
                  <DropdownMenuItem asChild>
                    <Link href='/settings/profile' className='cursor-pointer'>
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href='/items/my-items' className='cursor-pointer'>
                      My Items
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className='cursor-pointer'>
                    <LogoutButton />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className='flex items-center gap-3'>
              <Button variant='ghost' asChild className='hover:bg-accent/50'>
                <Link href='/auth/login'>Sign In</Link>
              </Button>
              <Button asChild className='shadow-sm hover:shadow'>
                <Link href='/auth/sign-up'>Sign Up</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <div className='flex md:hidden'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label='Toggle menu'
            className='hover:bg-accent/50'
          >
            {isMenuOpen ? (
              <X className='h-6 w-6' />
            ) : (
              <Menu className='h-6 w-6' />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile navigation menu */}
      {isMenuOpen && (
        <div className='fixed inset-0 top-16 z-50 bg-background/98 backdrop-blur md:hidden border-t border-border/30'>
          <div className='container py-8 px-6 bg-white space-y-8'>
            <div className='grid gap-5'>
              {navigationItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 text-lg font-medium px-3 py-2.5 rounded-md transition-colors hover:bg-accent",
                    pathname === item.href
                      ? "bg-accent/70 text-foreground"
                      : "text-foreground"
                  )}
                  onClick={closeMenu}
                >
                  {item.icon}
                  {item.name}
                  {item.badge && <Badge className='ml-2'>{item.badge}</Badge>}
                </Link>
              ))}
            </div>

            <div className='border-t border-border pt-6'>
              {user ? (
                <div className='space-y-5'>
                  <div className='text-sm font-medium text-muted-foreground mb-3 px-3'>
                    Account
                  </div>
                  <Link
                    href='/settings/profile'
                    className='flex items-center gap-3 text-lg font-medium px-3 py-2.5 rounded-md transition-colors hover:bg-accent'
                    onClick={closeMenu}
                  >
                    <User className='h-5 w-5' />
                    Profile
                  </Link>
                  <Link
                    href='/items/my-items'
                    className='flex items-center gap-3 text-lg font-medium px-3 py-2.5 rounded-md transition-colors hover:bg-accent'
                    onClick={closeMenu}
                  >
                    <PanelLeft className='h-5 w-5' />
                    My Items
                  </Link>
                  <div className='flex items-center gap-3 text-lg font-medium px-3 py-2.5 rounded-md transition-colors hover:bg-accent'>
                    <LogoutButton />
                  </div>
                </div>
              ) : (
                <div className='flex flex-col gap-3 px-2'>
                  <Button
                    asChild
                    size='lg'
                    className='w-full shadow-sm hover:shadow'
                  >
                    <Link href='/auth/login' onClick={closeMenu}>
                      Sign In
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant='outline'
                    size='lg'
                    className='w-full'
                  >
                    <Link href='/auth/sign-up' onClick={closeMenu}>
                      Sign Up
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
