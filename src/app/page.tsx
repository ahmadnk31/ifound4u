import Link from "next/link";


export default function Home() {
  return (
    <main className='min-h-screen'>
      {/* Hero Section */}
      <section className='bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800 py-20'>
        <div className='container mx-auto px-6 text-center'>
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
        </div>
      </section>

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
            Ready to find what you\&apos;ve lost?
          </h2>
          <p className='max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300 mb-8'>
            Join our community today and experience the power of people helping
            people.
          </p>
          <Link
            href='/auth/sign-up'
            className='px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors'
          >
            Join iFound4u Now
          </Link>
        </div>
      </section>
    </main>
  );
}
