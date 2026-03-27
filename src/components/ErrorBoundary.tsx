import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  private lastError: Error | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    this.lastError = error;
  }

  private handleRetry = () => {
    // If the error was a failed dynamic import (stale chunk), do a full reload
    if (
      this.lastError?.message?.includes("dynamically imported module") ||
      this.lastError?.message?.includes("Failed to fetch")
    ) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8">
          <AlertTriangle className="h-10 w-10 text-warning" />
          <p className="text-sm text-muted-foreground text-center">
            {this.props.fallbackMessage || "Something went wrong. Please try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
