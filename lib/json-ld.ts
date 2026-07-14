/**
 * Serialize JSON-LD for safe embedding in an HTML script element.
 *
 * Escaping `<` prevents user/data strings containing `</script>` from
 * terminating the script element early.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
