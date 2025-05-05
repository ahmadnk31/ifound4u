"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Upload, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const fetchUserAndItems = async () => {
      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);

        // Get recent items (5 most recent)
        const { data: items } = await supabase
          .from("items")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(4);

        setRecentItems(items || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserAndItems();

    // Set up listener for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <main className='min-h-screen'>
      {/* Hero Section - Personalized for logged in users */}
      <section className='bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 py-20'>
        <div className='container mx-auto px-6 text-center'>
          {isLoading ? (
            <div className='flex justify-center items-center'>
              <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
            </div>
          ) : user ? (
            <>
              <h1 className='text-5xl font-bold text-gray-900 dark:text-white mb-4 animate-fade-in'>
                Welcome back to <span className='text-blue-500'>iFound4u</span>
              </h1>
              <p className='mt-4 text-xl max-w-2xl mx-auto text-gray-700 dark:text-gray-300'>
                What would you like to do today?
              </p>

              <div className='mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto'>
                <Button
                  asChild
                  size='lg'
                  className='h-auto py-6 transition duration-300 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
                >
                  <Link href='/report'>
                    <Upload className='mr-2 h-5 w-5' />
                    Report a Lost or Found Item
                  </Link>
                </Button>

                <Button
                  asChild
                  size='lg'
                  className='h-auto py-6 transition duration-300 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
                >
                  <Link href='/items'>
                    <Search className='mr-2 h-5 w-5' />
                    Browse Items
                  </Link>
                </Button>

                <Button
                  asChild
                  size='lg'
                  className='h-auto py-6 transition duration-300 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600'
                >
                  <Link href='/messages'>View Your Messages</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className='text-6xl font-bold text-gray-900 dark:text-white mb-4'>
                iFound<span className='text-blue-500'>4u</span>
              </h1>
              <h2 className='text-3xl font-bold text-blue-500 mb-6'>
                Find your lost items
              </h2>

              <p className='mt-6 text-xl max-w-2xl mx-auto text-gray-700 dark:text-gray-300'>
                A community-driven platform that helps you find lost items and
                return found ones. Connect with helpful people in your area and
                recover what matters to you.
              </p>

              <div className='mt-10 flex flex-wrap gap-4 justify-center'>
                <Link
                  href='/auth/sign-up'
                  className='px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors'
                >
                  Get Started
                </Link>
                <Link
                  href='/auth/login'
                  className='px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg border border-blue-600 hover:bg-blue-50 transition-colors'
                >
                  Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Recent Items Section - Only show for logged in users */}
      {!isLoading && user && recentItems.length > 0 && (
        <section className='py-16 bg-white dark:bg-gray-900'>
          <div className='container mx-auto px-6'>
            <h2 className='text-3xl font-bold text-center text-gray-900 dark:text-white mb-8'>
              Recently Reported Items
            </h2>

            <div className='grid md:grid-cols-2 lg:grid-cols-4 gap-6'>
              {recentItems.map((item) => (
                <Card
                  key={item.id}
                  className='overflow-hidden hover:shadow-lg transition-shadow'
                >
                  <div className='p-4'>
                    <h3 className='font-semibold text-lg mb-1 truncate'>
                      {item.title}
                    </h3>
                    <p className='text-sm text-muted-foreground mb-2'>
                      {item.type === "lost" ? "Lost" : "Found"}:{" "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                    <p className='text-sm line-clamp-2 mb-4 h-10'>
                      {item.description}
                    </p>
                    <Link
                      href={`/item/${item.id}`}
                      className='inline-flex items-center text-blue-500 hover:text-blue-700'
                    >
                      View details <ArrowRight className='ml-1 h-3 w-3' />
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            <div className='text-center mt-8'>
              <Button asChild variant='outline'>
                <Link href='/items'>View All Items</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* How It Works Section */}
      <section className='py-16 bg-white dark:bg-gray-900'>
        <div className='container mx-auto px-6'>
          <h2 className='text-3xl font-bold text-center text-gray-900 dark:text-white mb-12'>
            How <span className='text-blue-500'>iFound4u</span> Works
          </h2>

          <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-8'>
            {/* Card 1 */}
            <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow'>
              <div className='h-12 w-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full mb-4'>
                <span className='text-blue-500 text-xl font-bold'>1</span>
              </div>
              <h3 className='text-xl font-semibold mb-2 text-gray-900 dark:text-white'>
                Create a Post
              </h3>
              <p className='text-gray-600 dark:text-gray-300'>
                Describe your lost item with details and location information to
                help others identify it.
              </p>
            </div>

            {/* Card 2 */}
            <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow'>
              <div className='h-12 w-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full mb-4'>
                <span className='text-blue-500 text-xl font-bold'>2</span>
              </div>
              <h3 className='text-xl font-semibold mb-2 text-gray-900 dark:text-white'>
                Community Help
              </h3>
              <p className='text-gray-600 dark:text-gray-300'>
                Our community members will help look for your item and notify
                you if they find it.
              </p>
            </div>

            {/* Card 3 */}
            <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow'>
              <div className='h-12 w-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full mb-4'>
                <span className='text-blue-500 text-xl font-bold'>3</span>
              </div>
              <h3 className='text-xl font-semibold mb-2 text-gray-900 dark:text-white'>
                Report Found Items
              </h3>
              <p className='text-gray-600 dark:text-gray-300'>
                Found something? Upload a photo and details to help connect
                items with their owners.
              </p>
            </div>

            {/* Card 4 */}
            <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow'>
              <div className='h-12 w-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full mb-4'>
                <span className='text-blue-500 text-xl font-bold'>4</span>
              </div>
              <h3 className='text-xl font-semibold mb-2 text-gray-900 dark:text-white'>
                Get Notifications
              </h3>
              <p className='text-gray-600 dark:text-gray-300'>
                Receive instant alerts when someone finds your item or reports
                something similar.
              </p>
            </div>

            {/* Card 5 */}
            <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow'>
              <div className='h-12 w-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full mb-4'>
                <span className='text-blue-500 text-xl font-bold'>5</span>
              </div>
              <h3 className='text-xl font-semibold mb-2 text-gray-900 dark:text-white'>
                Reward Helpers
              </h3>
              <p className='text-gray-600 dark:text-gray-300'>
                Show appreciation to community members who help you find your
                belongings.
              </p>
            </div>

            {/* Card 6 */}
            <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow'>
              <div className='h-12 w-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900 rounded-full mb-4'>
                <span className='text-blue-500 text-xl font-bold'>6</span>
              </div>
              <h3 className='text-xl font-semibold mb-2 text-gray-900 dark:text-white'>
                Build Community
              </h3>
              <p className='text-gray-600 dark:text-gray-300'>
                Join a network of helpful people making a difference in each
                other&apos;s lives.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className='py-16 bg-blue-50 dark:bg-gray-800'>
        <div className='container mx-auto px-6 text-center'>
          <h2 className='text-3xl font-bold text-gray-900 dark:text-white mb-4'>
            {user
              ? "Ready to help the community?"
              : "Ready to find what you've lost?"}
          </h2>
          <p className='max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300 mb-8'>
            {user
              ? "Report a lost or found item and make a difference in someone's day."
              : "Join our community today and experience the power of people helping people."}
          </p>
          <Button asChild size='lg'>
            <Link
              href={user ? "/report" : "/auth/sign-up"}
              className='px-8 py-3'
            >
              {user ? "Report an Item" : "Join iFound4u Now"}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
