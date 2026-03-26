export function success<T>(data: T) {
  return {
    data,
    success: true as const,
  };
}
