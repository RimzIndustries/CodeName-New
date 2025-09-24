
'use server';

import { z } from 'zod';

const contactFormSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  message: z.string().min(10, { message: 'Message must be at least 10 characters long.' }),
});

export async function submitContactForm(prevState: any, formData: FormData) {
  const validatedFields = contactFormSchema.safeParse({
    email: formData.get('email'),
    message: formData.get('message'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Please correct the errors and try again.',
      success: false,
    };
  }

  const { email, message } = validatedFields.data;

  // Here you would typically send an email, save to a database, etc.
  // For this example, we'll just log it and simulate a delay.
  console.log('New contact form submission:');
  console.log('Email:', email);
  console.log('Message:', message);

  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    message: 'Thank you for your message! We will get back to you shortly.',
    success: true,
  };
}
