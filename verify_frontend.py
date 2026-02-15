from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to http://localhost:5173/")
            page.goto("http://localhost:5173/")

            # Click Code button if present
            try:
                page.get_by_role("button", name="Code").click()
                print("Clicked Code button.")
            except:
                print("Code button not found, assuming already in code mode or unavailable.")

            # Wait for explorer to be visible
            print("Waiting for 'Explorer' text...")
            page.wait_for_selector("text=Explorer", timeout=30000)

            # Wait for editor to be visible (it has class monaco-editor usually, or just check for content)
            print("Waiting for content to load...")
            page.wait_for_timeout(5000) # Give it some time to load everything

            page.screenshot(path="verification.png")
            print("Screenshot saved to verification.png")
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()
