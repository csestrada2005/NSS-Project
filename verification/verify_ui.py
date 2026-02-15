from playwright.sync_api import Page, expect, sync_playwright
import os

def test_ui(page: Page):
    print("Navigating to http://localhost:5173/")
    page.goto("http://localhost:5173/")

    # Wait for the "Ares Project" title
    print("Waiting for 'Ares Project' title...")
    expect(page.get_by_text("Ares Project")).to_be_visible()

    # Check for the Toggle Buttons
    print("Checking for Toggle Buttons...")
    expect(page.get_by_title("Interact Mode")).to_be_visible()
    expect(page.get_by_title("Visual Mode")).to_be_visible()
    expect(page.get_by_title("Code Mode")).to_be_visible()

    # Check for Undo/Redo
    print("Checking for Undo/Redo...")
    expect(page.get_by_title("Undo (Ctrl+Z)")).to_be_visible()
    expect(page.get_by_title("Redo (Ctrl+Shift+Z)")).to_be_visible()

    # Click on "Code Mode" to check for Reinstall button
    print("Clicking 'Code Mode'...")
    page.get_by_title("Code Mode").click()

    # Wait for Reinstall button
    print("Waiting for 'Reinstall' button...")
    # Using locator for button with title containing 'Reinstall' or text 'Reinstall'
    # The button text is "Reinstall".
    expect(page.get_by_role("button", name="Reinstall")).to_be_visible()

    # Take Screenshot
    print("Taking screenshot...")
    os.makedirs("/home/jules/verification", exist_ok=True)
    page.screenshot(path="/home/jules/verification/verification.png")
    print("Screenshot taken.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_ui(page)
        except Exception as e:
            print(f"Error: {e}")
            # Take screenshot on failure
            os.makedirs("/home/jules/verification", exist_ok=True)
            page.screenshot(path="/home/jules/verification/failure.png")
        finally:
            browser.close()
