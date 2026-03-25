export function success<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}
