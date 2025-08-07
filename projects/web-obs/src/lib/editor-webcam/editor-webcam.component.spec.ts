import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorWebcamComponent } from './editor-webcam.component';

describe('EditorWebcamComponent', () => {
  let component: EditorWebcamComponent;
  let fixture: ComponentFixture<EditorWebcamComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorWebcamComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditorWebcamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
