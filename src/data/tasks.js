/* Tasks. One row per task:
   [project, title, category, assigneeIds, createdById, priority, status, startDay, dueDay, estHours, tags]
   Days are relative to today (negative = in the past). Checklists, descriptions, comments and files
   are added in seed.js from the templates below so every task has realistic detail. */
export const TASKS = [
  /* P-01 Northwind Retail - Website Revamp */
  ["P-01", "Home page wireframes (desktop + mobile)", "Web development", [11], 4, "High", "Completed", -46, -38, 12, ["design", "wireframe"]],
  ["P-01", "Design system: colours, type scale, buttons", "Web development", [11], 4, "Medium", "Completed", -40, -30, 10, ["design"]],
  ["P-01", "Set up Next.js project and CI pipeline", "Web development", [10], 4, "High", "Completed", -36, -31, 8, ["dev", "setup"]],
  ["P-01", "Build category page with filters", "Web development", [10, 12], 4, "High", "In Progress", -20, 3, 24, ["dev", "frontend"]],
  ["P-01", "Checkout flow: address, slots and payment", "Web development", [10], 4, "Urgent", "In Progress", -14, -2, 30, ["dev", "payments"]],
  ["P-01", "Migrate 340 blog posts from WordPress", "Web development", [12], 4, "Medium", "To Do", -5, 10, 16, ["content", "migration"]],
  ["P-01", "Product page image zoom and gallery", "Web development", [12], 10, "Medium", "Review", -10, 1, 6, ["frontend"]],
  ["P-01", "Cross-browser and mobile QA round 1", "Web development", [13], 4, "High", "On Hold", -6, 5, 10, ["qa"]],
  ["P-01", "Page speed: images, fonts and caching", "Web development", [10], 4, "Medium", "To Do", 2, 18, 8, ["performance"]],
  ["P-01", "Client training session and hand-over notes", "Web development", [4, 11], 4, "Low", "To Do", 18, 24, 4, ["handover"]],

  /* P-02 Sunrise Dental - SEO Growth */
  ["P-02", "Technical SEO audit of sunrisedental.in", "SEO", [6], 3, "High", "Completed", -74, -66, 10, ["audit", "technical"]],
  ["P-02", "Fix 404s, redirects and duplicate titles", "SEO", [9], 6, "High", "Completed", -64, -55, 8, ["technical"]],
  ["P-02", "Google Business Profile optimisation (4 clinics)", "SEO", [9], 6, "Medium", "Completed", -50, -40, 6, ["local", "gbp"]],
  ["P-02", "Location pages: Dwarka, Rohini, Saket, Noida", "SEO", [6, 9], 3, "High", "In Progress", -18, 4, 14, ["content", "local"]],
  ["P-02", "Monthly blog: 4 articles on dental implants", "SEO", [9], 6, "Medium", "In Progress", -8, 9, 12, ["content"]],
  ["P-02", "Backlink outreach to 30 health portals", "SEO", [9], 6, "Medium", "To Do", 0, 20, 15, ["offpage"]],
  ["P-02", "Monthly ranking report for the client", "SEO", [6], 3, "Medium", "To Do", 25, 28, 3, ["report"]],
  ["P-02", "Schema markup for dentists and reviews", "SEO", [6], 6, "Low", "Review", -6, -1, 4, ["technical", "schema"]],

  /* P-03 Urban Threads - Meta Ads */
  ["P-03", "Festive collection creative brief", "SMM", [7], 3, "High", "Completed", -38, -34, 4, ["creative", "brief"]],
  ["P-03", "Design 12 static ads for the festive sale", "Video editing/ graphic", [18], 3, "High", "Completed", -33, -25, 14, ["creative"]],
  ["P-03", "Catalogue ads with product feed", "SMM", [7], 3, "Urgent", "In Progress", -12, -3, 10, ["meta", "catalogue"]],
  ["P-03", "Retargeting audiences: 7, 30 and 90 days", "SMM", [7], 3, "High", "In Progress", -9, -1, 5, ["meta", "audience"]],
  ["P-03", "Edit 5 reels from the photo shoot", "Video editing/ graphic", [17], 3, "High", "On Hold", -7, 2, 12, ["reels", "video"]],
  ["P-03", "Weekly ROAS review and budget shift", "SMM", [7, 3], 3, "Urgent", "To Do", 0, 1, 2, ["meta", "report"]],
  ["P-03", "Influencer whitelisting with 3 creators", "SMM", [8], 3, "Medium", "To Do", 2, 7, 6, ["influencer"]],

  /* P-04 GreenLeaf Organics - Amazon */
  ["P-04", "Brand registry application", "E commerce", [21], 20, "High", "Completed", -34, -28, 3, ["amazon", "brand"]],
  ["P-04", "List 42 products with keywords", "E commerce", [22, 21], 20, "High", "In Progress", -25, 5, 30, ["amazon", "listing"]],
  ["P-04", "A+ content for top 10 products", "E commerce", [21], 20, "Medium", "In Progress", -10, 12, 16, ["amazon", "content"]],
  ["P-04", "Sponsored products campaign set-up", "E commerce", [20], 20, "High", "To Do", 4, 14, 6, ["amazon", "ads"]],
  ["P-04", "Competitor price check (weekly)", "E commerce", [22], 20, "Low", "To Do", 1, 6, 2, ["research"]],
  ["P-04", "Product photo retouching (42 SKUs)", "Video editing/ graphic", [18], 20, "Medium", "Review", -12, -2, 10, ["images"]],

  /* P-05 Apex Realty - Lead Generation */
  ["P-05", "Landing page for Apex Greens", "Web development", [12], 5, "High", "Completed", -58, -50, 12, ["landing-page"]],
  ["P-05", "Google search campaign: 3BHK Gurugram", "SMM", [7], 5, "High", "Completed", -50, -44, 6, ["google-ads"]],
  ["P-05", "Lead quality call with the client sales team", "Custom/ remark", [5, 15], 1, "Medium", "Completed", -30, -29, 1, ["client"], "Client call"],
  ["P-05", "Meta lead form campaign: Apex Heights", "SMM", [7], 5, "High", "In Progress", -15, 2, 6, ["meta", "leads"]],
  ["P-05", "Daily lead hand-off sheet to the client", "Custom/ remark", [14], 5, "Medium", "In Progress", -20, 12, 10, ["leads"], "Lead operations"],
  ["P-05", "Site visit follow-up WhatsApp flow", "Custom/ remark", [15], 5, "Medium", "To Do", 0, 6, 4, ["whatsapp"], "Automation"],
  ["P-05", "Monthly cost per lead report", "SMM", [7], 5, "Medium", "To Do", 8, 12, 3, ["report"]],

  /* P-06 Zenith Fitness - App UI */
  ["P-06", "User interviews with 8 gym members", "Web development", [11], 4, "Medium", "To Do", 5, 14, 10, ["research", "ux"]],
  ["P-06", "Competitor app teardown (5 apps)", "Web development", [11], 4, "Low", "To Do", 6, 16, 6, ["research"]],
  ["P-06", "Information architecture and user flows", "Web development", [11, 4], 4, "Medium", "To Do", 15, 28, 12, ["ux"]],
  ["P-06", "API feasibility check for bookings", "Web development", [10], 4, "Low", "To Do", 10, 22, 5, ["dev"]],

  /* P-07 Spice Route - Social Media */
  ["P-07", "Content calendar for next month", "SMM", [8], 3, "High", "Review", -5, 0, 5, ["calendar", "planning"]],
  ["P-07", "Shoot plan: new tasting menu", "SMM", [8, 17], 3, "Medium", "In Progress", -4, 3, 4, ["shoot"]],
  ["P-07", "Edit 4 reels for this week", "Video editing/ graphic", [17], 3, "High", "In Progress", -3, 2, 10, ["reels"]],
  ["P-07", "Design 8 posts: weekend offers", "Video editing/ graphic", [18], 3, "Medium", "Completed", -12, -6, 8, ["creative"]],
  ["P-07", "Reply to DMs and reviews (daily)", "SMM", [8], 3, "Low", "In Progress", -30, 15, 15, ["community"]],
  ["P-07", "Monthly performance report", "SMM", [8], 3, "Medium", "Completed", -15, -11, 3, ["report"]],
  ["P-07", "Diwali campaign concepts", "SMM", [8, 18], 3, "High", "To Do", 1, 9, 6, ["festive", "creative"]],

  /* P-08 BrightPath School - completed */
  ["P-08", "Admissions landing page", "Web development", [12], 3, "High", "Completed", -148, -135, 10, ["landing-page"]],
  ["P-08", "Video ad: parent testimonials", "Video editing/ graphic", [17], 3, "High", "Completed", -140, -120, 14, ["video"]],
  ["P-08", "Search ads: CBSE school near me", "SMM", [7], 3, "Medium", "Completed", -130, -60, 8, ["google-ads"]],
  ["P-08", "Final campaign report", "SMM", [7], 3, "Medium", "Completed", -25, -21, 3, ["report"]],
  ["P-08", "Print banner adaptation", "Video editing/ graphic", [18], 3, "Low", "Cancelled", -100, -90, 3, ["print"]],

  /* P-09 Internal - Agency website (on hold) */
  ["P-09", "Case study write-ups (6 clients)", "Custom/ remark", [1, 6], 2, "Medium", "On Hold", -60, 10, 12, ["content", "internal"], "Content"],
  ["P-09", "New service pages design", "Web development", [11], 2, "Medium", "On Hold", -50, 15, 10, ["design", "internal"]],
  ["P-09", "Careers page with job openings", "Web development", [12], 2, "Low", "To Do", 10, 30, 6, ["internal"]],

  /* P-10 Kaveri Textiles - Flipkart */
  ["P-10", "Flipkart seller account documents", "E commerce", [21], 20, "High", "To Do", 3, 8, 3, ["flipkart"]],
  ["P-10", "Saree catalogue sheet (120 items)", "E commerce", [21], 20, "Medium", "To Do", 6, 20, 18, ["flipkart", "catalogue"]],
  ["P-10", "Pricing and shipping plan", "E commerce", [20], 20, "Medium", "To Do", 8, 15, 4, ["pricing"]],

  /* P-11 MedPlus Clinics - Google Ads */
  ["P-11", "Keyword research for 6 clinic locations", "SMM", [7], 3, "High", "Completed", -27, -22, 6, ["google-ads", "keywords"]],
  ["P-11", "Call tracking set-up", "SMM", [7], 3, "High", "In Progress", -10, 1, 4, ["tracking"]],
  ["P-11", "Performance Max assets", "Video editing/ graphic", [18], 3, "Medium", "In Progress", -8, 4, 8, ["creative"]],
  ["P-11", "Landing page A/B test", "SEO", [6], 3, "Medium", "To Do", 3, 17, 6, ["cro"]],

  /* P-12 Internal - Hiring */
  ["P-12", "Job descriptions for 4 roles", "Human resource", [19], 2, "High", "Completed", -20, -16, 4, ["hiring"]],
  ["P-12", "Post jobs on LinkedIn and Naukri", "Human resource", [19], 2, "Medium", "Completed", -15, -13, 2, ["hiring"]],
  ["P-12", "Screen 60 applications for developers", "Human resource", [19, 4], 2, "High", "In Progress", -10, 2, 10, ["hiring", "screening"]],
  ["P-12", "Technical test for shortlisted developers", "Human resource", [10], 4, "Medium", "To Do", 3, 10, 4, ["hiring"]],
  ["P-12", "Offer letters and onboarding checklist", "Human resource", [19], 2, "Medium", "To Do", 20, 30, 4, ["onboarding"]],

  /* P-13 Lotus Interiors - completed */
  ["P-13", "Brand film storyboard", "Video editing/ graphic", [17], 3, "High", "Completed", -58, -50, 6, ["video"]],
  ["P-13", "60-second brand film edit", "Video editing/ graphic", [17], 3, "High", "Completed", -45, -30, 20, ["video"]],
  ["P-13", "6 short cut-downs for social", "Video editing/ graphic", [17, 18], 3, "Medium", "Completed", -32, -26, 8, ["reels"]],

  /* P-14 FreshCart - Shopify */
  ["P-14", "Shopify theme customisation", "Web development", [12], 4, "High", "Completed", -50, -30, 20, ["shopify"]],
  ["P-14", "Delivery slot app integration", "Web development", [10], 4, "Urgent", "Review", -20, -1, 12, ["shopify", "app"]],
  ["P-14", "Payment gateway and COD rules", "Web development", [10], 4, "High", "In Progress", -8, 2, 6, ["payments"]],
  ["P-14", "Upload 600 products via CSV", "E commerce", [22], 20, "Medium", "In Progress", -6, 4, 10, ["catalogue"]],
  ["P-14", "Launch QA checklist", "Web development", [13], 4, "High", "To Do", 2, 6, 6, ["qa", "launch"]],

  /* tasks without a project */
  [null, "Prepare agency pitch deck for D2C brands", "Custom/ remark", [1, 5, 14], 1, "High", "In Progress", -4, 3, 6, ["sales", "pitch"], "Sales material"],
  [null, "Renew Google Partner certification", "SMM", [7], 3, "Medium", "To Do", 0, 14, 3, ["training"]],
  [null, "Monthly team one-on-ones", "Human resource", [3], 2, "Low", "To Do", 2, 9, 4, ["team"]],
  [null, "Update proposal templates", "Custom/ remark", [15], 5, "Medium", "Review", -7, -1, 3, ["sales"], "Sales material"],
  [null, "Laptop allocation for new joiners", "Human resource", [19], 2, "Medium", "Completed", -18, -12, 2, ["it", "onboarding"]],
  [null, "Canva team account clean-up", "Video editing/ graphic", [18], 3, "Low", "To Do", 5, 20, 1, ["tools"]],
  [null, "Write SOP for client onboarding", "Custom/ remark", [1, 2], 1, "Medium", "In Progress", -12, 8, 6, ["process"], "Process"],
  [null, "Review overdue invoices with accounts", "Custom/ remark", [1, 2], 1, "High", "To Do", 0, 2, 2, ["finance"], "Finance"],
  [null, "Learn GA4 explorations", "SEO", [9], 6, "Low", "To Do", 3, 25, 5, ["training"]],
  [null, "Old CRM data export (archived)", "Custom/ remark", [12], 4, "Low", "Cancelled", -40, -30, 2, ["internal"], "Internal"]
];

/* Checklist ideas per category (the first items are ticked off as the task progresses) */
export const CHECKLISTS = {
  "Web development": ["Requirements confirmed", "Design approved", "Build", "Responsive check", "Client review", "Go live"],
  "SMM": ["Brief received", "Audience and budget set", "Ads created", "Tracking checked", "Launch", "First review after 3 days"],
  "E commerce": ["Data sheet ready", "Images ready", "Upload", "Quality check", "Live check on marketplace"],
  "Video editing/ graphic": ["Brief and references", "First draft", "Internal review", "Client changes", "Final export"],
  "Human resource": ["Plan", "Do the work", "Share with manager", "Close"],
  "SEO": ["Research", "Write / fix", "Internal review", "Publish", "Check indexing"],
  "Custom/ remark": ["Prepare", "Do the work", "Share", "Follow up"]
};

export const DESCRIPTIONS = {
  "Web development": "Build it to the approved design and the brief in the project folder. Test on Chrome, Safari and a phone before moving it to Review.",
  "SMM": "Follow the campaign brief and the brand guide. Keep the naming format Client | Campaign | Audience, and share results in the project thread.",
  "E commerce": "Use the data sheet shared by the client. Check marketplace rules for titles, images and prices before uploading.",
  "Video editing/ graphic": "Use the brand kit (fonts, colours, logo). Export in 1080x1350 and 1080x1920 unless the brief says otherwise.",
  "Human resource": "Keep candidate data private. Update the hiring tracker after each step.",
  "SEO": "Follow the SEO checklist: keyword in title and H1, internal links, alt text, and a check in Search Console after publishing.",
  "Custom/ remark": "See the notes in the comments. Ask your manager if anything is unclear."
};

/* Comment lines used across tasks; {a} is replaced by an @mention of someone on the task */
export const COMMENT_LINES = [
  "Started on this today, will share a first version by evening.",
  "{a} can you check the latest version when you get a moment?",
  "Client asked for a small change in the colours, updating now.",
  "Done from my side, moving it to Review.",
  "Blocked on the client's login details, I have followed up on WhatsApp.",
  "Looks good to me. Please go ahead.",
  "{a} please add the final numbers here before the call.",
  "Uploaded the files in the attachments below.",
  "Need one more day for this because of the extra pages.",
  "Shared with @Mr. Bhatia (client) for approval."
];

/* Files already attached to some tasks (generated as real files on download) */
export const FILE_NAMES = {
  "Web development": ["homepage-wireframe.png", "sitemap.pdf", "checkout-flow.png"],
  "SMM": ["campaign-brief.pdf", "audience-plan.pdf"],
  "E commerce": ["listing-template.pdf", "product-photo-01.jpg"],
  "Video editing/ graphic": ["storyboard.pdf", "ad-creative-v2.png"],
  "Human resource": ["job-description.pdf"],
  "SEO": ["seo-audit.pdf", "keyword-map.pdf"],
  "Custom/ remark": ["notes.pdf"]
};
