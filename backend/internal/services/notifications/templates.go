package notifications

import "fmt"

// ─── baseTemplate ─────────────────────────────────────────────────────────────

// baseTemplate returns a complete HTML email document built from the supplied
// content fragments. All styles are inlined so they render correctly across
// email clients that strip <style> tags.
//
// Parameters:
//   - appName:   the application name shown in the header (e.g. "ChiselPost")
//   - appURL:    the canonical app URL shown in the footer (e.g. "https://chiselpost.com")
//   - title:     used in <title> and as the main heading in the email header
//   - preheader: short preview text hidden from the email body
//   - bodyHTML:  the main body content (paragraphs, lists, etc.)
//   - ctaURL:    the URL the CTA button should link to (empty = no button)
//   - ctaText:   the label on the CTA button
func baseTemplate(appName, appURL, title, preheader, bodyHTML, ctaURL, ctaText string) string {
	ctaSection := ""
	if ctaURL != "" && ctaText != "" {
		ctaSection = fmt.Sprintf(`
		<table width="100%%" cellpadding="0" cellspacing="0" border="0" style="margin: 32px 0 8px;">
			<tr>
				<td align="center">
					<a href="%s"
					   style="display:inline-block;background-color:#7C3AED;color:#ffffff;
					          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
					          font-size:15px;font-weight:600;text-decoration:none;
					          padding:14px 32px;border-radius:8px;letter-spacing:0.01em;">
						%s
					</a>
				</td>
			</tr>
		</table>`, ctaURL, ctaText)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>%s</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<!-- preheader (hidden preview text) -->
<span style="display:none;font-size:1px;color:#F3F4F6;max-height:0;max-width:0;opacity:0;overflow:hidden;">%s</span>

<!-- outer wrapper -->
<table width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;padding:40px 16px;">
  <tr>
    <td align="center">

      <!-- card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%%;background:#ffffff;border-radius:12px;
                    box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">

        <!-- header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7C3AED 0%%,#9D6EFF 100%%);
                     padding:32px 40px 28px;text-align:center;">
            <span style="font-size:22px;font-weight:700;color:#ffffff;
                         letter-spacing:-0.02em;text-decoration:none;">
              &#9889; %s
            </span>
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="padding:40px 40px 8px;">
            %s
            %s
          </td>
        </tr>

        <!-- divider -->
        <tr>
          <td style="padding:24px 40px 0;">
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:0;">
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="padding:20px 40px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
              You received this email because you have an account with %s.<br>
              Visit us at <a href="%s" style="color:#7C3AED;text-decoration:none;">%s</a><br>
              &copy; 2025 %s. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!-- /card -->

    </td>
  </tr>
</table>
<!-- /outer wrapper -->

</body>
</html>`, title, preheader, appName, bodyHTML, ctaSection, appName, appURL, appURL, appName)
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

// h1Style is the inline style string for the main heading.
const h1Style = `style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;"`

// pStyle is the inline style string for body paragraphs.
const pStyle = `style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;"`

// highlightBoxStyle is the inline style for a highlighted info box.
const highlightBoxStyle = `style="background:#F5F3FF;border-left:4px solid #7C3AED;
       border-radius:6px;padding:16px 20px;margin:0 0 20px;"`
