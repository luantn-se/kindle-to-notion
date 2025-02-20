import { createApi } from "unsplash-js";

require("dotenv").config();

import { NotionAdapter } from "../adapters";
import { GroupedClipping } from "../interfaces";
import { CreatePageParams, Emoji, BlockType } from "../interfaces";
import {
  makeHighlightsBlocks,
  updateSync,
  getUnsyncedHighlights,
  makeBlocks,
} from "../utils";
import * as nodeFetch from "node-fetch";


async function createNewbookHighlights(title: string, author: string, highlights: string[],  notionInstance: NotionAdapter) {
  const createPageParams: CreatePageParams = {
    parentDatabaseId: process.env.BOOK_DB_ID as string,
    properties: {
      title: title,
      author: author,
      bookName: title,
    },
    children: makeHighlightsBlocks(highlights, BlockType.quote),
    icon: Emoji["🔖"],
    cover: await getRandomImage()
  }
  await notionInstance.createPage(createPageParams);
  await sleep(400);
}

async function getRandomImage(query: string = 'sexy girl'): Promise<string> {
  const unsplash = createApi({
    accessKey: 'CB2oyAAohZBWGDSq9CSgz37bT0v56ZN5TXajB57J8sU',
    fetch: nodeFetch.default as unknown as typeof fetch,
  });

  const dataRes = await unsplash.photos.getRandom({query: query});
  let cover = 'https://thecatapi.com/api/images/get?format=src&type=png';
  if (dataRes.type === 'success') {
    // @ts-ignore
    cover = dataRes.response.urls.full;
  }

  return cover;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class Notion {
  private notion;

  constructor() {
    this.notion = new NotionAdapter();
  }




  /* Method to get Notion block id of the Notion page given the book name */
  getIdFromBookName = async (bookName: string) => {
    const response = await this.notion.queryDatabase({
      database_id: process.env.BOOK_DB_ID as string,
      filter: {
        or: [
          {
            property: "title",
            text: {
              equals: bookName,
            },
          },
        ],
      },
    });
    const [book] = response.results;
    if (book) {
      return book.id;
    } else {
      return null;
    }
  };

  /* Method to sync highlights to notion */
  syncHighlights = async (books: GroupedClipping[]) => {
    try {
      // get unsynced highlights from each book
      const unsyncedBooks = getUnsyncedHighlights(books);
      // if unsynced books are present
      if (unsyncedBooks.length > 0) {
        console.log("\n🚀 Syncing highlights to Notion");
        for (const book of unsyncedBooks) {
          console.log(`\n🔁 Syncing book: ${book.title}`);
          const bookId = await this.getIdFromBookName(book.title);
          // if the book is already present in Notion
          if (bookId) {
            console.log(`📚 Book already present, appending highlights`);
            // append unsynced highlights at the end of the page

            if(book.highlights.length <= 100) {
              await this.notion.appendBlockChildren(
                bookId,
                makeBlocks(book.highlights, BlockType.quote)
              );
            } else {
              // handle pagination if there are more than 100 highlights
              let highlightsTracker = 0;
              while(highlightsTracker < book.highlights.length) {
                await this.notion.appendBlockChildren(
                  bookId,
                  makeBlocks(book.highlights.slice(highlightsTracker, highlightsTracker+99), BlockType.quote)
                );
                highlightsTracker+=99;
              }
            }

          } else {
            console.log(`📚 Book not present, creating notion page`);
            if(book.highlights.length <= 100) {
              await createNewbookHighlights(book.title, book.author, book.highlights, this.notion);
            } else {
              // handle pagination if there are more than 100 highlights
              let highlightsTracker = 0;
              while(highlightsTracker < book.highlights.length) {
                if(highlightsTracker == 0) {
                  // create a new page for the first 100 highlights
                  await createNewbookHighlights(book.title, book.author, book.highlights.slice(highlightsTracker, highlightsTracker+99), this.notion);
                  highlightsTracker += 99;
                } else {
                  // insert the remaining highlights by paginations
                  let newBookId = await this.getIdFromBookName(book.title);
                  if(newBookId) {
                    await this.notion.appendBlockChildren(
                      newBookId,
                      makeBlocks(book.highlights.slice(highlightsTracker, highlightsTracker+99), BlockType.quote)
                    );
                    highlightsTracker += 99;
                  }
                }
              }
            }
          }

          // after each book is successfully synced, update the sync metadata (cache)
          updateSync(book);
        }
        console.log("\n✅ Successfully synced highlights to Notion");
      } else {
        console.log("🟢 Every book is already synced!");
      }
    } catch (error: unknown) {
      console.error("❌ Failed to sync highlights", error);
      throw error;
    } finally {
      console.log("--------------------------------------");
    }
  };
}
