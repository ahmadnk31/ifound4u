"use client";

import { ItemReportForm } from "@/components/item-report-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ReportPage() {
  return (
    <div className='container mx-auto py-10 px-4 md:px-6'>
      <div className='max-w-3xl mx-auto'>
        <Card className='border-none shadow-none sm:border sm:shadow-sm'>
          <CardHeader className='pb-6'>
            <CardTitle className='text-3xl'>
              Lost or Found Item Report
            </CardTitle>
            <CardDescription>
              Help us reunite lost items with their owners by providing accurate
              information about the item you found or lost.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemReportForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
