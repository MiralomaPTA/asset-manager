/** 303 redirect with a relative Location, resolved by the browser against the current origin. */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
