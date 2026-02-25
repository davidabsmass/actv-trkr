

## Clarification Needed

I inspected newuniformdesign.com/contact and found **no active forms** on that page -- only static contact info (phone number, email link, mailing address). The site runs on:
- **WordPress** with the **Salient theme**
- **WPBakery Page Builder** (formerly Visual Composer)

The previous plan assumed forms already exist on the site. Before building the universal form capture system, I need to know:

1. **Which form plugin(s) are you using or planning to use?** The Salient theme supports its own built-in Nectar forms, plus Gravity Forms, WPForms, Contact Form 7, and others.
2. **Are there forms on other pages** (not /contact) that I didn't check?
3. **Are you planning to add forms to the site?** If so, which plugin will you use?

The universal form capture system from the previous plan will work regardless of the answer -- the JS-layer intercepts any `<form>` submit event in the DOM. But knowing the specific plugins helps me add richer server-side hooks that capture field labels, entry IDs, and other metadata the JS layer can't see.

### What I can build right now (no matter which form plugin)

The **client-side universal form listener** (Layer 1 from the previous plan) works with any form on any WordPress site -- Salient built-in forms, Gravity Forms, WPForms, Contact Form 7, Avada, or plain HTML. It listens for `submit` events at the document level and captures all input fields.

If you confirm which form plugin(s) you want to support, I'll finalize the plan and build both layers.

