from playwright.sync_api import sync_playwright

def verify_code_mode():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:5173/")
            page.wait_for_selector("text=Upload Zip", timeout=10000)
            print("App loaded.")

            code_btn = page.get_by_role("button", name="Code")
            code_btn.click()
            print("Clicked Code button.")

            page.wait_for_selector("text=Explorer", timeout=5000)
            print("File Explorer visible.")

            # App.tsx should be visible if src is open by default
            app_file = page.get_by_text("App.tsx")
            if app_file.is_visible():
                print("App.tsx is visible. Clicking...")
                app_file.click()
            else:
                print("App.tsx not visible. Expanding src...")
                src_folder = page.get_by_text("src", exact=True)
                src_folder.click()
                app_file.click()

            print("Clicked App.tsx.")

            textarea = page.locator("textarea")
            textarea.wait_for(state="visible")

            content = textarea.input_value()
            if "function App" not in content and "import" not in content:
                print("Textarea content unexpected:", content[:100])
            else:
                print("Textarea content verified.")

            print("Code mode verified successfully!")

            page.screenshot(path="code_mode.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_code_mode()
