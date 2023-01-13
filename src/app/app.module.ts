import {Component, NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import {KitchenSinkMdcModule} from './kitchen-sink-mdc/kitchen-sink-mdc';
import {KitchenSinkModule} from './kitchen-sink/kitchen-sink';

@Component({
  selector: 'kitchen-sink-root',
  template: `
    <h1>Kitchen sink app</h1>
    <kitchen-sink></kitchen-sink>
    <kitchen-sink-mdc></kitchen-sink-mdc>
  `,
})
export class KitchenSinkRoot {}

@NgModule({
  declarations: [KitchenSinkRoot],
  exports: [KitchenSinkRoot],
  bootstrap: [KitchenSinkRoot],
    imports: [
    BrowserModule.withServerTransition({ appId: 'kitchen-faucet' }),
    KitchenSinkMdcModule,
    KitchenSinkModule,
    BrowserAnimationsModule,
  ],
  providers: [],
})
export class KitchenSinkRootModule { }
