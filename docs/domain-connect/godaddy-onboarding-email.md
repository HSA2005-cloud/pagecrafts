# GoDaddy Domain Connect onboarding email

Send to: **domainconnect@godaddy.com**
Subject: **Domain Connect template onboarding request — PageCrafts (pagecrafts.in / website)**

Fill the four `<< >>` placeholders, delete this heading block, and send as plain text.

---

Hi Domain Connect team,

We are PageCrafts (https://pagecrafts.in), an AI website builder for small
businesses in India. We would like to onboard a Domain Connect template on
GoDaddy so customers who already own a domain can connect it with a single
Authorize tap, without editing DNS by hand.

**Template**

- providerId: pagecrafts.in
- serviceId: website
- providerName: PageCrafts
- serviceName: Website
- Flow: synchronous Domain Connect
- syncRedirectDomain: pagecrafts.in
- Callback / redirect URI: https://pagecrafts.in/api/v1/domains/domain-connect/callback

**Records the template writes**

- APEXCNAME @ -> %pagesTarget%
- CNAME www -> %pagesTarget%

`%pagesTarget%` is the customer's Cloudflare Pages hostname (for example
my-shop.pages.dev). It is filled in by us when the customer starts the flow
from PageCrafts, so the customer never types it.

We use APEXCNAME rather than CNAME at the apex so the record is legal at the
zone root and each DNS provider can resolve it their own way.

**Template file**

<< PASTE THE PR LINK HERE — the pull request you open against
   https://github.com/Domain-Connect/Templates >>

**Logo**

https://pagecrafts.in/icon.svg

We can supply SVG or PNG at another size if you need one.

**What we are asking for**

Please enable this template for GoDaddy Domain Connect, so that apply URLs of
the form:

  .../v2/domainTemplates/providers/pagecrafts.in/services/website/apply

work for domains whose DNS is hosted at GoDaddy.

We are happy to provide a test account, a sample apply URL, or anything else
that helps the review.

Thanks,

<< YOUR NAME >>
<< YOUR ROLE — e.g. Founder, or Platform Engineer >>
<< YOUR EMAIL >> · << YOUR PHONE, with +91 >>
PageCrafts — https://pagecrafts.in
