'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Log error to console (you could also send to error tracking service)
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Reload the page
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Check if it's a network error
      const isNetworkError =
        this.state.error?.message?.includes('network') ||
        this.state.error?.message?.includes('ERR_NETWORK_CHANGED');

      return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-2xl font-bold">
              {isNetworkError ? 'Network Connection Changed' : 'Something went wrong'}
            </h2>
            <p className="text-muted-foreground max-w-md">
              {isNetworkError
                ? 'Your network connection changed. Please refresh the page to continue.'
                : 'An unexpected error occurred. Please try refreshing the page.'}
            </p>
          </div>
          <Button onClick={this.handleReset} size="lg">
            Refresh Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
